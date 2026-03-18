"""
Stuck job detection and cleanup task.

Runs periodically to detect and handle submissions stuck in processing states.
"""

import logging
from datetime import datetime, timedelta
from uuid import UUID

from app.core.database import SessionLocal
from app.models.enums import SubmissionStatus
from app.models.submission import Submission

logger = logging.getLogger(__name__)

# Timeout thresholds (in minutes) - per SPRINT-PLAN.md: stuck >5min → FAILED
CLONE_TIMEOUT_MINUTES = 5  # Max time for cloning step
SCORE_TIMEOUT_MINUTES = 5  # Max time for scoring step
MAX_RETRY_COUNT = 3  # Max automatic retries before marking as failed


def cleanup_stuck_submissions() -> dict:
    """
    Find and handle stuck submissions.

    Submissions are considered stuck if:
    - Status is CLONING and clone_started_at > CLONE_TIMEOUT_MINUTES ago
    - Status is SCORING and job_started_at > SCORE_TIMEOUT_MINUTES ago

    Handling:
    - If retry_count < MAX_RETRY_COUNT: reset to QUEUED for retry
    - If retry_count >= MAX_RETRY_COUNT: mark as SCORE_FAILED

    Returns:
        Dict with counts of handled submissions
    """
    db = SessionLocal()

    try:
        now = datetime.utcnow()
        clone_cutoff = now - timedelta(minutes=CLONE_TIMEOUT_MINUTES)
        score_cutoff = now - timedelta(minutes=SCORE_TIMEOUT_MINUTES)

        results = {
            "stuck_cloning": 0,
            "stuck_scoring": 0,
            "requeued": 0,
            "failed": 0,
        }

        # Find stuck in CLONING
        stuck_cloning = (
            db.query(Submission)
            .filter(
                Submission.status == SubmissionStatus.CLONING,
                Submission.clone_started_at < clone_cutoff,
            )
            .all()
        )

        results["stuck_cloning"] = len(stuck_cloning)

        for submission in stuck_cloning:
            _handle_stuck_submission(
                db,
                submission,
                f"Clone timed out after {CLONE_TIMEOUT_MINUTES} minutes",
                results,
            )

        # Find stuck in SCORING
        stuck_scoring = (
            db.query(Submission)
            .filter(
                Submission.status == SubmissionStatus.SCORING,
                Submission.job_started_at < score_cutoff,
            )
            .all()
        )

        results["stuck_scoring"] = len(stuck_scoring)

        for submission in stuck_scoring:
            _handle_stuck_submission(
                db,
                submission,
                f"Scoring timed out after {SCORE_TIMEOUT_MINUTES} minutes",
                results,
            )

        db.commit()

        if results["requeued"] > 0 or results["failed"] > 0:
            logger.info(
                f"Cleanup complete: {results['stuck_cloning']} stuck cloning, "
                f"{results['stuck_scoring']} stuck scoring, "
                f"{results['requeued']} requeued, {results['failed']} failed"
            )

        return results

    except Exception as e:
        logger.exception(f"Error in cleanup task: {e}")
        db.rollback()
        raise

    finally:
        db.close()


def _handle_stuck_submission(
    db,
    submission: Submission,
    error_message: str,
    results: dict,
) -> None:
    """
    Handle a single stuck submission.

    Requeue if under retry limit, otherwise mark as failed.
    """
    submission.retry_count += 1

    if submission.retry_count < MAX_RETRY_COUNT:
        # Requeue for retry
        submission.status = SubmissionStatus.QUEUED
        submission.error_message = f"{error_message} (retry {submission.retry_count})"

        # Re-enqueue the job
        try:
            from app.worker.queue import enqueue_scoring_job

            job_id = enqueue_scoring_job(
                submission_id=str(submission.id),
                organization_id=str(submission.organization_id),
            )
            submission.job_id = job_id
            results["requeued"] += 1

            logger.info(
                f"Requeued stuck submission {submission.id} "
                f"(retry {submission.retry_count}/{MAX_RETRY_COUNT})"
            )

        except Exception as e:
            # Job enqueue failed, mark as failed
            submission.status = SubmissionStatus.SCORE_FAILED
            submission.error_message = f"{error_message}; requeue failed: {e}"
            results["failed"] += 1

            logger.error(f"Failed to requeue submission {submission.id}: {e}")
    else:
        # Max retries exceeded
        submission.status = SubmissionStatus.SCORE_FAILED
        submission.error_message = f"{error_message} (max retries exceeded)"
        results["failed"] += 1

        logger.warning(
            f"Submission {submission.id} failed permanently after {MAX_RETRY_COUNT} retries"
        )


def cleanup_old_jobs() -> dict:
    """
    Clean up old completed/failed jobs from the queue.

    This prevents Redis memory bloat from job metadata.

    Returns:
        Dict with count of cleaned jobs
    """
    try:
        from redis import Redis
        from rq import Queue
        from rq.job import Job
        from rq.registry import FailedJobRegistry, FinishedJobRegistry

        from app.core.config import settings

        redis_conn = Redis.from_url(settings.redis_url)
        queue = Queue("scoring", connection=redis_conn)

        # Clean finished jobs older than 1 day
        finished_registry = FinishedJobRegistry(queue=queue)
        finished_count = len(finished_registry)

        # Clean failed jobs older than 7 days
        failed_registry = FailedJobRegistry(queue=queue)
        failed_count = len(failed_registry)

        # RQ automatically cleans up based on result_ttl and failure_ttl
        # Just log stats for monitoring
        return {
            "finished_jobs": finished_count,
            "failed_jobs": failed_count,
        }

    except Exception as e:
        logger.exception(f"Error cleaning old jobs: {e}")
        return {"error": str(e)}
