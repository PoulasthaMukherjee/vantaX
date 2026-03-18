"""
Prometheus metrics endpoint.

Exposes metrics in Prometheus text format for scraping.
"""

from datetime import datetime, timedelta

import redis
from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.models.enums import SubmissionStatus
from app.models.llm_usage import LLMUsageLog
from app.models.submission import Submission

router = APIRouter()


def format_prometheus_metric(
    name: str,
    value: float,
    help_text: str,
    metric_type: str = "gauge",
    labels: dict | None = None,
) -> str:
    """Format a single metric in Prometheus text format."""
    lines = []
    lines.append(f"# HELP {name} {help_text}")
    lines.append(f"# TYPE {name} {metric_type}")

    if labels:
        label_str = ",".join(f'{k}="{v}"' for k, v in labels.items())
        lines.append(f"{name}{{{label_str}}} {value}")
    else:
        lines.append(f"{name} {value}")

    return "\n".join(lines)


@router.get("/prometheus/metrics")
async def prometheus_metrics(
    db: Session = Depends(get_db),
):
    """
    Prometheus-compatible metrics endpoint.

    No authentication required for Prometheus scraping.
    Expose only on internal network in production.

    Metrics exposed:
    - vibe_queue_depth: Number of jobs in queue
    - vibe_queue_failed_count: Number of failed jobs
    - vibe_submissions_total: Total submissions by status
    - vibe_job_latency_seconds: Job processing latency histogram
    - vibe_llm_calls_total: LLM API calls
    - vibe_llm_cost_usd_total: LLM API cost
    - vibe_llm_errors_total: LLM API errors
    - vibe_api_up: API health status
    """
    metrics = []
    now = datetime.utcnow()
    one_hour_ago = now - timedelta(hours=1)

    # API health (always 1 if this endpoint responds)
    metrics.append(
        format_prometheus_metric(
            "vibe_api_up", 1, "API health status (1=healthy)", "gauge"
        )
    )

    # Queue depth
    queue_depth = 0
    queue_failed = 0
    redis_error = None
    try:
        r = redis.from_url(settings.redis_url)
        queue_depth = r.llen("rq:queue:scoring") or 0
        queue_failed = r.llen("rq:queue:failed") or 0
    except Exception as e:
        redis_error = str(e)
        import logging

        logging.getLogger(__name__).warning(f"Failed to get Redis queue metrics: {e}")

    metrics.append(
        format_prometheus_metric(
            "vibe_queue_depth", queue_depth, "Number of jobs waiting in queue", "gauge"
        )
    )

    metrics.append(
        format_prometheus_metric(
            "vibe_queue_failed_count",
            queue_failed,
            "Number of failed jobs in DLQ",
            "gauge",
        )
    )

    # Submissions by status
    status_counts = (
        db.query(
            Submission.status,
            func.count(Submission.id),
        )
        .group_by(Submission.status)
        .all()
    )

    for status, count in status_counts:
        metrics.append(
            format_prometheus_metric(
                "vibe_submissions_total",
                count,
                "Total submissions by status",
                "gauge",
                {"status": status.value},
            )
        )

    # Job latency (completed in last hour)
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
            latency_sec = (sub.job_completed_at - sub.job_started_at).total_seconds()
            latencies.append(latency_sec)

    if latencies:
        latencies.sort()
        # P50, P95, P99
        p50 = latencies[int(len(latencies) * 0.50)]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[min(int(len(latencies) * 0.99), len(latencies) - 1)]
        avg = sum(latencies) / len(latencies)

        metrics.append(
            format_prometheus_metric(
                "vibe_job_latency_seconds",
                avg,
                "Job processing latency in seconds",
                "gauge",
                {"quantile": "avg"},
            )
        )
        metrics.append(
            format_prometheus_metric(
                "vibe_job_latency_seconds",
                p50,
                "Job processing latency in seconds",
                "gauge",
                {"quantile": "0.5"},
            )
        )
        metrics.append(
            format_prometheus_metric(
                "vibe_job_latency_seconds",
                p95,
                "Job processing latency in seconds",
                "gauge",
                {"quantile": "0.95"},
            )
        )
        metrics.append(
            format_prometheus_metric(
                "vibe_job_latency_seconds",
                p99,
                "Job processing latency in seconds",
                "gauge",
                {"quantile": "0.99"},
            )
        )

    # LLM stats
    llm_total = (
        db.query(func.count(LLMUsageLog.id))
        .filter(LLMUsageLog.created_at >= one_hour_ago)
        .scalar()
        or 0
    )

    llm_cost = (
        db.query(func.sum(LLMUsageLog.cost_usd))
        .filter(LLMUsageLog.created_at >= one_hour_ago)
        .scalar()
        or 0
    )

    llm_errors = (
        db.query(func.count(LLMUsageLog.id))
        .filter(
            LLMUsageLog.created_at >= one_hour_ago,
            LLMUsageLog.success == False,
        )
        .scalar()
        or 0
    )

    metrics.append(
        format_prometheus_metric(
            "vibe_llm_calls_total",
            llm_total,
            "Total LLM API calls in last hour",
            "counter",
        )
    )

    metrics.append(
        format_prometheus_metric(
            "vibe_llm_cost_usd_total",
            float(llm_cost),
            "Total LLM API cost in USD",
            "counter",
        )
    )

    metrics.append(
        format_prometheus_metric(
            "vibe_llm_errors_total",
            llm_errors,
            "Total LLM API errors in last hour",
            "counter",
        )
    )

    # SLO thresholds (as info metrics)
    metrics.append(
        format_prometheus_metric(
            "vibe_slo_queue_depth_threshold",
            settings.alert_queue_depth_threshold,
            "Queue depth SLO threshold",
            "gauge",
        )
    )

    metrics.append(
        format_prometheus_metric(
            "vibe_slo_job_latency_p95_seconds",
            settings.slo_job_p95_seconds,
            "Job latency P95 SLO in seconds",
            "gauge",
        )
    )

    # Return as plain text
    output = "\n\n".join(metrics) + "\n"
    return Response(content=output, media_type="text/plain; charset=utf-8")
