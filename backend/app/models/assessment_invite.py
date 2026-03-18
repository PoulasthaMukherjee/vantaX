"""
AssessmentInvite model - for invite-only assessments.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.assessment import Assessment
    from app.models.organization import Organization
    from app.models.user import User


class AssessmentInvite(BaseModel):
    """
    Invitation to participate in an invite-only assessment.

    Used when assessment visibility is 'invite_only'.
    """

    __tablename__ = "assessment_invites"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "email", name="uq_assessment_invites_assessment_email"
        ),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # Assessment reference
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"),
        index=True,
    )

    # Invite details
    email: Mapped[str] = mapped_column(String(255))

    # Who invited
    invited_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Acceptance tracking
    accepted_at: Mapped[datetime | None] = mapped_column()

    # Relationships
    organization: Mapped["Organization"] = relationship()
    assessment: Mapped["Assessment"] = relationship(back_populates="invites")
    inviter: Mapped["User"] = relationship(foreign_keys=[invited_by])

    def __repr__(self) -> str:
        return f"<AssessmentInvite {self.email} -> {self.assessment_id}>"

    @property
    def is_accepted(self) -> bool:
        """Check if invite has been accepted."""
        return self.accepted_at is not None
