"""
LLMUsageLog model - track LLM cost/latency per tenant.
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.submission import Submission


class LLMUsageLog(Base):
    """
    Log of LLM API calls for cost tracking and monitoring.

    Each call is logged with tokens, cost, latency, and success status.
    Used for per-org budget enforcement.
    """

    __tablename__ = "llm_usage_log"
    __table_args__ = (
        Index("idx_llm_usage_org", "organization_id", "created_at"),
        Index("idx_llm_usage_submission", "submission_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )

    # Submission context
    submission_id: Mapped[UUID] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"),
    )

    # Model info
    model: Mapped[str] = mapped_column(String(100))

    # Token usage
    prompt_tokens: Mapped[int] = mapped_column()
    completion_tokens: Mapped[int] = mapped_column()
    total_tokens: Mapped[int] = mapped_column()

    # Cost (USD with 6 decimal places)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))

    # Performance
    latency_ms: Mapped[int | None] = mapped_column()

    # Retry tracking
    attempt_number: Mapped[int] = mapped_column(default=1)

    # Success/failure
    success: Mapped[bool] = mapped_column()
    error_type: Mapped[str | None] = mapped_column(String(50))

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship()
    submission: Mapped["Submission"] = relationship()

    def __repr__(self) -> str:
        status = "OK" if self.success else f"FAIL:{self.error_type}"
        return f"<LLMUsageLog {self.model} {self.total_tokens}tok ${self.cost_usd} {status}>"
