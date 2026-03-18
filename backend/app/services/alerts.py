"""
Admin alerts service.

Sends alerts for queue depth, LLM failure rates, and other critical conditions.
Per SPRINT-PLAN.md requirements.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.llm_usage import LLMUsageLog

logger = logging.getLogger(__name__)


@dataclass
class AlertResult:
    """Result of an alert send attempt."""

    success: bool
    error: str | None = None


def send_slack_alert(
    title: str,
    message: str,
    severity: str = "warning",
    fields: dict[str, Any] | None = None,
) -> AlertResult:
    """
    Send an alert to Slack webhook.

    Args:
        title: Alert title
        message: Alert message
        severity: "info", "warning", or "critical"
        fields: Optional key-value pairs to display

    Returns:
        AlertResult with success status
    """
    if not settings.slack_webhook_url:
        logger.debug("Slack webhook not configured, skipping alert")
        return AlertResult(success=True)  # Not an error, just not configured

    # Color based on severity
    color_map = {
        "info": "#36a64f",  # green
        "warning": "#f59e0b",  # yellow/orange
        "critical": "#dc2626",  # red
    }
    color = color_map.get(severity, "#808080")

    # Build Slack attachment
    attachment = {
        "color": color,
        "title": f":{'information_source' if severity == 'info' else 'warning' if severity == 'warning' else 'rotating_light'}: {title}",
        "text": message,
        "ts": int(datetime.utcnow().timestamp()),
    }

    if fields:
        attachment["fields"] = [
            {"title": k, "value": str(v), "short": True} for k, v in fields.items()
        ]

    payload = {
        "attachments": [attachment],
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                settings.slack_webhook_url,
                json=payload,
            )
            response.raise_for_status()

        logger.info(f"Slack alert sent: {title}")
        return AlertResult(success=True)

    except httpx.TimeoutException:
        logger.error("Slack webhook timeout")
        return AlertResult(success=False, error="Timeout")
    except Exception as e:
        logger.exception(f"Slack alert failed: {e}")
        return AlertResult(success=False, error=str(e))


def check_queue_depth_alert(queue_depth: int) -> bool:
    """
    Check if queue depth exceeds threshold and send alert if needed.

    Per SPRINT-PLAN.md: queue depth > threshold triggers admin alert.

    Args:
        queue_depth: Current number of jobs in queue

    Returns:
        True if alert was sent
    """
    threshold = settings.alert_queue_depth_threshold

    if queue_depth > threshold:
        send_slack_alert(
            title="High Queue Depth",
            message=f"Scoring queue has {queue_depth} pending jobs (threshold: {threshold})",
            severity="warning",
            fields={
                "Queue Depth": queue_depth,
                "Threshold": threshold,
                "Environment": settings.environment,
            },
        )
        return True

    return False


def check_llm_failure_rate_alert(db: Session, window_minutes: int = 60) -> bool:
    """
    Check if LLM failure rate exceeds threshold and send alert if needed.

    Per SPRINT-PLAN.md: LLM failure rate > threshold triggers admin alert.

    Args:
        db: Database session
        window_minutes: Time window to check (default 60 min)

    Returns:
        True if alert was sent
    """
    from sqlalchemy import Integer, case

    threshold = settings.alert_llm_failure_rate_threshold
    window_start = datetime.utcnow() - timedelta(minutes=window_minutes)

    # Get total and failed counts using case() for portable SQL
    stats = (
        db.query(
            func.count(LLMUsageLog.id).label("total"),
            func.sum(case((LLMUsageLog.success == False, 1), else_=0)).label("failed"),
        )
        .filter(
            LLMUsageLog.created_at >= window_start,
        )
        .first()
    )

    if not stats:
        return False

    total = stats.total or 0
    failed = int(stats.failed or 0)

    if total == 0:
        return False

    failure_rate = failed / total

    if failure_rate > threshold:
        send_slack_alert(
            title="High LLM Failure Rate",
            message=f"LLM failure rate is {failure_rate:.1%} over the last {window_minutes} minutes",
            severity="critical" if failure_rate > 0.3 else "warning",
            fields={
                "Failure Rate": f"{failure_rate:.1%}",
                "Total Calls": total,
                "Failed Calls": failed,
                "Threshold": f"{threshold:.1%}",
                "Window": f"{window_minutes} min",
            },
        )
        return True

    return False


def send_scoring_failed_admin_alert(
    submission_id: str,
    assessment_title: str,
    error: str,
    candidate_email: str | None = None,
) -> AlertResult:
    """
    Send admin alert when scoring fails.

    Args:
        submission_id: Submission UUID
        assessment_title: Assessment title
        error: Error message
        candidate_email: Optional candidate email

    Returns:
        AlertResult
    """
    return send_slack_alert(
        title="Scoring Failed",
        message=f"Submission scoring failed and could not be recovered.",
        severity="warning",
        fields={
            "Submission ID": submission_id,
            "Assessment": assessment_title,
            "Error": error[:200],  # Truncate long errors
            "Candidate": candidate_email or "N/A",
        },
    )


def send_stuck_jobs_alert(stuck_count: int, failed_count: int) -> AlertResult:
    """
    Send admin alert about stuck jobs found by cleanup task.

    Args:
        stuck_count: Number of stuck jobs found
        failed_count: Number marked as failed

    Returns:
        AlertResult
    """
    if stuck_count == 0:
        return AlertResult(success=True)

    return send_slack_alert(
        title="Stuck Jobs Detected",
        message=f"Cleanup task found {stuck_count} stuck submission(s), marked {failed_count} as failed.",
        severity="warning",
        fields={
            "Stuck Jobs": stuck_count,
            "Marked Failed": failed_count,
            "Action": "Jobs exceeded 5-minute threshold",
        },
    )
