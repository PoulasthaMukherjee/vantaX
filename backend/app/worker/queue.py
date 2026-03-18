"""
Redis Queue (RQ) job management.

Handles job enqueueing and status tracking.
"""

import os
from typing import Optional

import redis
from rq import Queue

from app.core.config import settings

# Initialize Redis connection
_redis_conn: Optional[redis.Redis] = None
_queue: Optional[Queue] = None


def get_redis_connection() -> redis.Redis:
    """Get or create Redis connection."""
    global _redis_conn
    if _redis_conn is None:
        _redis_conn = redis.from_url(settings.redis_url)
    return _redis_conn


def get_queue() -> Queue:
    """Get or create the scoring queue."""
    global _queue
    if _queue is None:
        conn = get_redis_connection()
        _queue = Queue("scoring", connection=conn)
    return _queue


def enqueue_scoring_job(
    submission_id: str,
    organization_id: str,
    priority: str = "default",
) -> str:
    """
    Enqueue a submission for scoring.

    Args:
        submission_id: UUID of the submission
        organization_id: UUID of the organization
        priority: Job priority (high, default, low)

    Returns:
        Job ID
    """
    queue = get_queue()

    # Job timeout: 180 seconds (per architecture decisions)
    job = queue.enqueue(
        "app.worker.tasks.score_submission.score_submission",
        submission_id=submission_id,
        organization_id=organization_id,
        job_timeout=180,
        result_ttl=3600,  # Keep result for 1 hour
        failure_ttl=86400 * 30,  # Keep failed jobs for 30 days
    )

    return job.id


def get_job_status(job_id: str) -> dict:
    """
    Get status of a job.

    Returns:
        Dict with status, result, and error info
    """
    queue = get_queue()
    job = queue.fetch_job(job_id)

    if job is None:
        return {"status": "not_found"}

    return {
        "status": job.get_status(),
        "result": job.result if job.is_finished else None,
        "error": job.exc_info if job.is_failed else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "ended_at": job.ended_at.isoformat() if job.ended_at else None,
    }


def get_queue_stats() -> dict:
    """
    Get queue statistics.

    Returns:
        Dict with queue depth and job counts
    """
    queue = get_queue()

    return {
        "name": queue.name,
        "count": queue.count,
        "started_job_registry_count": len(queue.started_job_registry),
        "finished_job_registry_count": len(queue.finished_job_registry),
        "failed_job_registry_count": len(queue.failed_job_registry),
    }


def enqueue_cleanup_job() -> str:
    """
    Enqueue the stuck submission cleanup task.

    This should be called periodically (e.g., every 5 minutes via cron).

    Returns:
        Job ID
    """
    queue = get_queue()

    job = queue.enqueue(
        "app.worker.tasks.cleanup.cleanup_stuck_submissions",
        job_timeout=60,
        result_ttl=300,  # Keep result for 5 minutes
    )

    return job.id


def run_cleanup_sync() -> dict:
    """
    Run cleanup synchronously (for CLI/cron use).

    Returns:
        Cleanup results
    """
    from app.worker.tasks.cleanup import cleanup_stuck_submissions

    return cleanup_stuck_submissions()
