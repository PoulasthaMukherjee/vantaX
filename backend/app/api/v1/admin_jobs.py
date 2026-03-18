"""
Admin job management endpoints.

Provides queue visibility, failed job management, and rescore functionality.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import redis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from rq import Queue
from rq.job import Job
from sqlalchemy.orm import Session

from app.api.deps import get_current_org, get_current_user, get_db, require_role
from app.core.config import settings
from app.models.enums import SubmissionStatus
from app.models.organization import Organization
from app.models.submission import Submission
from app.models.user import User

router = APIRouter()


def get_redis_connection():
    """Get Redis connection for RQ."""
    return redis.from_url(settings.redis_url)


@router.get("/jobs/queue")
async def get_queue_status(
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Get current queue status and jobs.

    Returns:
        - queue_depth: Jobs waiting
        - active_jobs: Currently processing
        - failed_count: Failed jobs
        - jobs: List of queued job details
    """
    try:
        conn = get_redis_connection()
        queue = Queue("scoring", connection=conn)

        # Get queue info
        queued_jobs = queue.jobs[:50]  # Limit to 50
        failed_queue = Queue("failed", connection=conn)

        jobs_info = []
        for job in queued_jobs:
            # Extract submission_id from job args if available
            submission_id = None
            if job.args and len(job.args) > 0:
                submission_id = str(job.args[0])

            jobs_info.append(
                {
                    "job_id": job.id,
                    "submission_id": submission_id,
                    "status": job.get_status(),
                    "enqueued_at": (
                        job.enqueued_at.isoformat() if job.enqueued_at else None
                    ),
                    "started_at": (
                        job.started_at.isoformat() if job.started_at else None
                    ),
                }
            )

        return {
            "success": True,
            "data": {
                "queue_depth": len(queue),
                "active_jobs": queue.started_job_registry.count,
                "failed_count": len(failed_queue),
                "jobs": jobs_info,
            },
        }
    except Exception as e:
        return {
            "success": True,
            "data": {
                "queue_depth": 0,
                "active_jobs": 0,
                "failed_count": 0,
                "jobs": [],
                "error": str(e),
            },
        }


@router.get("/jobs/failed")
async def get_failed_jobs(
    limit: int = Query(default=50, le=100),
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Get list of failed submissions.

    Returns submissions with CLONE_FAILED or SCORE_FAILED status.
    """
    failed_subs = (
        db.query(Submission)
        .filter(
            Submission.organization_id == org.id,
            Submission.status.in_(
                [SubmissionStatus.CLONE_FAILED, SubmissionStatus.SCORE_FAILED]
            ),
        )
        .order_by(Submission.updated_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "data": {
            "count": len(failed_subs),
            "submissions": [
                {
                    "id": str(sub.id),
                    "candidate_id": str(sub.candidate_id),
                    "assessment_id": str(sub.assessment_id),
                    "github_repo_url": sub.github_repo_url,
                    "status": sub.status.value,
                    "error_message": sub.error_message,
                    "retry_count": sub.retry_count,
                    "submitted_at": (
                        sub.submitted_at.isoformat() if sub.submitted_at else None
                    ),
                    "updated_at": (
                        sub.updated_at.isoformat() if sub.updated_at else None
                    ),
                }
                for sub in failed_subs
            ],
        },
    }


@router.get("/jobs/stuck")
async def get_stuck_jobs(
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Get submissions stuck in processing states.

    Returns submissions in CLONING or SCORING status for > 5 minutes.
    """
    from datetime import timedelta

    threshold = datetime.utcnow() - timedelta(
        minutes=settings.stuck_job_threshold_minutes
    )

    stuck_subs = (
        db.query(Submission)
        .filter(
            Submission.organization_id == org.id,
            Submission.status.in_([SubmissionStatus.CLONING, SubmissionStatus.SCORING]),
            Submission.updated_at < threshold,
        )
        .order_by(Submission.updated_at.asc())
        .all()
    )

    return {
        "success": True,
        "data": {
            "count": len(stuck_subs),
            "threshold_minutes": settings.stuck_job_threshold_minutes,
            "submissions": [
                {
                    "id": str(sub.id),
                    "candidate_id": str(sub.candidate_id),
                    "assessment_id": str(sub.assessment_id),
                    "github_repo_url": sub.github_repo_url,
                    "status": sub.status.value,
                    "submitted_at": (
                        sub.submitted_at.isoformat() if sub.submitted_at else None
                    ),
                    "updated_at": (
                        sub.updated_at.isoformat() if sub.updated_at else None
                    ),
                    "stuck_for_minutes": int(
                        (datetime.utcnow() - sub.updated_at).total_seconds() / 60
                    ),
                }
                for sub in stuck_subs
            ],
        },
    }


@router.post("/jobs/{submission_id}/rescore")
async def rescore_submission(
    submission_id: UUID,
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Rescore a submission.

    Resets status to QUEUED and enqueues for reprocessing.
    Only works for EVALUATED, SCORE_FAILED, or CLONE_FAILED submissions.
    """
    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
            Submission.organization_id == org.id,
        )
        .first()
    )

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBMISSION_NOT_FOUND", "message": "Submission not found"},
        )

    # Only allow rescore for completed or failed submissions
    rescorable_statuses = [
        SubmissionStatus.EVALUATED,
        SubmissionStatus.SCORE_FAILED,
        SubmissionStatus.CLONE_FAILED,
    ]

    if submission.status not in rescorable_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_STATUS",
                "message": f"Cannot rescore submission with status {submission.status.value}",
            },
        )

    # Reset submission state
    submission.status = SubmissionStatus.QUEUED
    submission.error_message = None
    submission.final_score = None
    submission.commit_sha = None
    submission.analyzed_files = None
    submission.clone_started_at = None
    submission.clone_completed_at = None
    submission.job_started_at = None
    submission.job_completed_at = None
    submission.evaluated_at = None
    submission.retry_count = (submission.retry_count or 0) + 1
    submission.submitted_at = datetime.utcnow()

    db.commit()

    # Enqueue for processing
    try:
        conn = get_redis_connection()
        queue = Queue("scoring", connection=conn)
        queue.enqueue(
            "app.worker.tasks.score_submission.score_submission",
            str(submission.id),
            job_timeout=settings.job_timeout_seconds,
        )
    except Exception as e:
        # Log the failure - submission is in QUEUED status but job not enqueued
        import logging

        logging.getLogger(__name__).error(
            f"Failed to enqueue rescore job for submission {submission.id}: {e}"
        )

    return {
        "success": True,
        "data": {
            "id": str(submission.id),
            "status": submission.status.value,
            "message": "Submission queued for rescoring",
        },
    }


@router.post("/jobs/rescore-failed")
async def rescore_all_failed(
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    _membership=Depends(require_role("owner")),  # Owner only for bulk operations
):
    """
    Rescore all failed submissions.

    Owner-only bulk operation. Requeues all CLONE_FAILED and SCORE_FAILED submissions.
    """
    failed_subs = (
        db.query(Submission)
        .filter(
            Submission.organization_id == org.id,
            Submission.status.in_(
                [SubmissionStatus.CLONE_FAILED, SubmissionStatus.SCORE_FAILED]
            ),
        )
        .all()
    )

    if not failed_subs:
        return {
            "success": True,
            "data": {
                "requeued_count": 0,
                "message": "No failed submissions to rescore",
            },
        }

    conn = get_redis_connection()
    queue = Queue("scoring", connection=conn)

    requeued = 0
    for sub in failed_subs:
        sub.status = SubmissionStatus.QUEUED
        sub.error_message = None
        sub.final_score = None
        sub.retry_count = (sub.retry_count or 0) + 1
        sub.submitted_at = datetime.utcnow()

        try:
            queue.enqueue(
                "app.worker.tasks.score_submission.score_submission",
                str(sub.id),
                job_timeout=settings.job_timeout_seconds,
            )
            requeued += 1
        except Exception as e:
            import logging

            logging.getLogger(__name__).error(
                f"Failed to enqueue rescore job for submission {sub.id}: {e}"
            )

    db.commit()

    return {
        "success": True,
        "data": {
            "requeued_count": requeued,
            "message": f"Requeued {requeued} failed submissions for rescoring",
        },
    }


@router.post("/jobs/cleanup-stuck")
async def cleanup_stuck_jobs(
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    _membership=Depends(require_role("owner")),
):
    """
    Manually trigger stuck job cleanup.

    Owner-only operation. Marks stuck jobs as failed or requeues them.
    """
    from app.worker.tasks.cleanup import cleanup_stuck_submissions

    result = cleanup_stuck_submissions()

    return {
        "success": True,
        "data": result,
    }
