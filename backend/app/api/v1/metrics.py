"""
Metrics endpoint for monitoring.

Exposes queue depth, job latency, error rates per SPRINT-PLAN.md.
"""

from datetime import datetime, timedelta

import redis
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.core.config import settings
from app.models.enums import SubmissionStatus
from app.models.llm_usage import LLMUsageLog
from app.models.submission import Submission

router = APIRouter()


@router.get("/metrics")
async def get_metrics(
    db: Session = Depends(get_db),
    _membership=Depends(require_role("admin", "owner")),
):
    """
    Get system metrics for monitoring.

    Requires admin or owner role.

    Returns:
        - queue_depth: Number of jobs waiting in queue
        - job_latency_p95_ms: 95th percentile job completion time
        - error_rate_5min: Error rate in the last 5 minutes
        - submissions_by_status: Count of submissions by status
        - llm_stats: LLM usage statistics
    """
    now = datetime.utcnow()
    five_min_ago = now - timedelta(minutes=5)
    one_hour_ago = now - timedelta(hours=1)

    # Queue depth from Redis
    queue_depth = 0
    redis_available = True
    try:
        r = redis.from_url(settings.redis_url)
        queue_depth = r.llen("rq:queue:scoring") or 0
    except Exception as e:
        redis_available = False
        import logging

        logging.getLogger(__name__).warning(f"Failed to get Redis queue depth: {e}")

    # Job latency (p95) - from completed submissions in last hour
    completed_subs = (
        db.query(Submission)
        .filter(
            Submission.status == SubmissionStatus.EVALUATED,
            Submission.evaluated_at >= one_hour_ago,
            Submission.job_started_at.isnot(None),
            Submission.job_completed_at.isnot(None),
        )
        .all()
    )

    latencies = []
    for sub in completed_subs:
        if sub.job_started_at and sub.job_completed_at:
            latency_ms = (
                sub.job_completed_at - sub.job_started_at
            ).total_seconds() * 1000
            latencies.append(latency_ms)

    latencies.sort()
    p95_latency = None
    if latencies:
        p95_idx = int(len(latencies) * 0.95)
        p95_latency = latencies[min(p95_idx, len(latencies) - 1)]

    # Error rate in last 5 minutes
    recent_subs = (
        db.query(Submission)
        .filter(
            Submission.submitted_at >= five_min_ago,
        )
        .all()
    )

    total_recent = len(recent_subs)
    failed_recent = sum(
        1
        for s in recent_subs
        if s.status in (SubmissionStatus.CLONE_FAILED, SubmissionStatus.SCORE_FAILED)
    )
    error_rate_5min = (failed_recent / total_recent * 100) if total_recent > 0 else 0

    # Submissions by status
    status_counts = (
        db.query(
            Submission.status,
            func.count(Submission.id),
        )
        .group_by(Submission.status)
        .all()
    )

    submissions_by_status = {
        str(status.value): count for status, count in status_counts
    }

    # LLM stats for last hour
    llm_stats = (
        db.query(
            func.count(LLMUsageLog.id).label("total_calls"),
            func.sum(LLMUsageLog.cost_usd).label("total_cost"),
            func.avg(LLMUsageLog.latency_ms).label("avg_latency_ms"),
        )
        .filter(
            LLMUsageLog.created_at >= one_hour_ago,
        )
        .first()
    )

    llm_failed = (
        db.query(func.count(LLMUsageLog.id))
        .filter(
            LLMUsageLog.created_at >= one_hour_ago,
            LLMUsageLog.success == False,
        )
        .scalar()
        or 0
    )

    llm_success_rate = 0
    if llm_stats.total_calls and llm_stats.total_calls > 0:
        llm_success_rate = (
            (llm_stats.total_calls - llm_failed) / llm_stats.total_calls
        ) * 100

    return {
        "success": True,
        "data": {
            "timestamp": now.isoformat(),
            "queue_depth": queue_depth,
            "job_latency_p95_ms": p95_latency,
            "error_rate_5min": round(error_rate_5min, 2),
            "submissions_by_status": submissions_by_status,
            "llm_stats": {
                "total_calls_1hr": llm_stats.total_calls or 0,
                "total_cost_1hr": float(llm_stats.total_cost or 0),
                "avg_latency_ms": float(llm_stats.avg_latency_ms or 0),
                "success_rate_1hr": round(llm_success_rate, 2),
            },
            "thresholds": {
                "queue_depth_alert": 100,
                "job_latency_p95_target_ms": 180000,  # 180s per SPRINT-PLAN
                "api_latency_p95_target_ms": 400,
            },
        },
    }
