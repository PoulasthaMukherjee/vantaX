"""
CandidateProfile model - one profile per user per organization.
"""

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ARRAY, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class CandidateProfile(BaseModel):
    """
    Candidate profile scoped to an organization.

    A user can have different profiles in different organizations.
    Contains professional info, resume, and gamification scores.
    """

    __tablename__ = "candidate_profiles"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "user_id", name="uq_candidate_profiles_org_user"
        ),
        UniqueConstraint("slug", name="uq_candidate_profiles_slug"),
        Index("idx_candidate_profiles_public", "is_public"),
        Index("idx_candidate_profiles_vibe_score", "vibe_score"),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # User reference
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    # Public URL slug (globally unique, e.g., "jane-doe")
    slug: Mapped[str | None] = mapped_column(String(100), unique=True)

    # Profile info
    name: Mapped[str | None] = mapped_column(String(255))
    mobile: Mapped[str | None] = mapped_column(String(20))

    # External links
    github_url: Mapped[str | None] = mapped_column(Text)
    github_verified: Mapped[bool] = mapped_column(default=False)
    linkedin_url: Mapped[str | None] = mapped_column(Text)

    # Resume
    resume_file_path: Mapped[str | None] = mapped_column(Text)
    resume_filename: Mapped[str | None] = mapped_column(String(255))

    # About
    about_me: Mapped[str | None] = mapped_column(Text)

    # Skills (user-entered + auto-derived from assessments/resume)
    skills: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # Scores and points
    vibe_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0"))
    total_points: Mapped[int] = mapped_column(default=0)

    # Visibility
    is_public: Mapped[bool] = mapped_column(default=False)

    # Relationships
    organization: Mapped["Organization"] = relationship(
        back_populates="candidate_profiles"
    )
    user: Mapped["User"] = relationship(back_populates="candidate_profiles")

    def __repr__(self) -> str:
        return f"<CandidateProfile user={self.user_id} org={self.organization_id}>"

    @property
    def is_complete(self) -> bool:
        """Check if profile has all required fields filled."""
        return all(
            [
                self.name,
                self.github_url,
                self.resume_file_path,
            ]
        )
