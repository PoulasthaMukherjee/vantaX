"""
Organization model - top-level tenant.
"""

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.admin_invite import AdminInvite
    from app.models.assessment import Assessment
    from app.models.candidate_profile import CandidateProfile
    from app.models.event import Event
    from app.models.organization_user import OrganizationUser
    from app.models.submission import Submission
    from app.models.user import User


class Organization(BaseModel):
    """
    Organization model - the top-level tenant.

    All tenant-owned data (profiles, assessments, submissions, etc.)
    is scoped to an organization via organization_id FK.
    """

    __tablename__ = "organizations"

    # Organization info
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    # Status: active, suspended
    status: Mapped[str] = mapped_column(String(20), default="active")

    # Plan: free, pro, enterprise
    plan: Mapped[str] = mapped_column(String(20), default="free")

    # LLM Budget (cents per month, NULL = unlimited)
    llm_budget_cents: Mapped[int | None] = mapped_column()

    # Creator (owner)
    created_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    # Relationships
    creator: Mapped["User | None"] = relationship(
        back_populates="created_organizations",
        foreign_keys=[created_by],
    )
    members: Mapped[list["OrganizationUser"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    admin_invites: Mapped[list["AdminInvite"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    candidate_profiles: Mapped[list["CandidateProfile"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    assessments: Mapped[list["Assessment"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["Event"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"
