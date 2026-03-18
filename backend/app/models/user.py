"""
User model - global user identities (auth via Firebase).
"""

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.candidate_profile import CandidateProfile
    from app.models.organization import Organization
    from app.models.organization_user import OrganizationUser
    from app.models.submission import Submission


class User(BaseModel):
    """
    User model representing authenticated users.

    Users are global (not org-scoped). A user can belong to multiple
    organizations via OrganizationUser memberships.
    """

    __tablename__ = "users"

    # Firebase UID - unique identifier from Firebase Auth
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)

    # User info
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    email_verified: Mapped[bool] = mapped_column(default=False)

    # Relationships
    organization_memberships: Mapped[list["OrganizationUser"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_organizations: Mapped[list["Organization"]] = relationship(
        back_populates="creator",
        foreign_keys="Organization.created_by",
    )
    candidate_profiles: Mapped[list["CandidateProfile"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="candidate",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
