"""
TalentShortlist model - shortlisted profiles for organizations.
"""

from uuid import UUID

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class TalentShortlist(BaseModel):
    """
    Shortlisted profiles for an organization.

    Allows companies to save profiles they're interested in.
    """

    __tablename__ = "talent_shortlists"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    added_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "profile_id", name="uq_talent_shortlist_org_profile"
        ),
        Index("idx_talent_shortlist_org", "organization_id"),
    )
