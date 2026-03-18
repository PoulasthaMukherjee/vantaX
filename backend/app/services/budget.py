"""
LLM Budget checking service.

Provides budget enforcement for per-org LLM usage.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.llm_usage import LLMUsageLog
from app.models.organization import Organization


@dataclass
class BudgetStatus:
    """Result of a budget check."""

    allowed: bool
    current_spend_cents: int
    budget_cents: int | None  # None = unlimited
    usage_percent: float | None  # None = unlimited
    warning: str | None = None


def get_current_month_spend(db: Session, organization_id: UUID) -> int:
    """
    Get total LLM spend in cents for the current month.

    Only counts successful API calls.
    """
    # Get first day of current month
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    # Sum cost_usd and convert to cents
    result = (
        db.query(func.sum(LLMUsageLog.cost_usd))
        .filter(
            LLMUsageLog.organization_id == organization_id,
            LLMUsageLog.success == True,
            LLMUsageLog.created_at >= month_start,
        )
        .scalar()
    )

    if result is None:
        return 0

    # Convert USD to cents (multiply by 100)
    return int(result * 100)


def check_budget(db: Session, organization_id: UUID) -> BudgetStatus:
    """
    Check if organization is within LLM budget.

    Returns:
        BudgetStatus with allowed flag and usage details.

    Budget enforcement:
        - If llm_budget_cents is NULL, unlimited budget (always allowed)
        - If spend >= budget * hard_stop_threshold (1.0), blocked
        - If spend >= budget * warn_threshold (0.8), warning issued
    """
    # Get organization
    org = db.query(Organization).filter(Organization.id == organization_id).first()

    if not org:
        return BudgetStatus(
            allowed=False,
            current_spend_cents=0,
            budget_cents=0,
            usage_percent=None,
            warning="Organization not found",
        )

    # Unlimited budget
    if org.llm_budget_cents is None:
        return BudgetStatus(
            allowed=True,
            current_spend_cents=get_current_month_spend(db, organization_id),
            budget_cents=None,
            usage_percent=None,
        )

    current_spend = get_current_month_spend(db, organization_id)
    budget = org.llm_budget_cents
    usage_percent = (current_spend / budget * 100) if budget > 0 else 0

    # Check hard stop threshold
    hard_stop = budget * settings.llm_budget_hard_stop_threshold
    if current_spend >= hard_stop:
        return BudgetStatus(
            allowed=False,
            current_spend_cents=current_spend,
            budget_cents=budget,
            usage_percent=usage_percent,
            warning=f"LLM budget exceeded ({usage_percent:.1f}% of ${budget/100:.2f})",
        )

    # Check warning threshold
    warn_threshold = budget * settings.llm_budget_warn_threshold
    warning = None
    if current_spend >= warn_threshold:
        warning = f"Approaching LLM budget limit ({usage_percent:.1f}% used)"

    return BudgetStatus(
        allowed=True,
        current_spend_cents=current_spend,
        budget_cents=budget,
        usage_percent=usage_percent,
        warning=warning,
    )


def is_budget_exceeded(db: Session, organization_id: UUID) -> bool:
    """
    Quick check if budget is exceeded.

    Use this for fast checks before expensive operations.
    """
    status = check_budget(db, organization_id)
    return not status.allowed
