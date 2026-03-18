"""
OrganizationUser model - memberships with per-org roles.
"""

import enum
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class OrganizationUserRole(str, enum.Enum):
    """Roles for organization membership."""

    OWNER = "owner"
    ADMIN = "admin"
    REVIEWER = "reviewer"
    CANDIDATE = "candidate"


class OrganizationUser(Base):
    """
    Organization membership - links users to organizations with roles.

    Uses composite primary key (organization_id, user_id).
    """

    __tablename__ = "organization_users"

    # Composite primary key
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Role in this organization
    role: Mapped[OrganizationUserRole] = mapped_column(
        Enum(
            OrganizationUserRole,
            name="organization_user_role",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=OrganizationUserRole.CANDIDATE,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="organization_memberships")

    def __repr__(self) -> str:
        return f"<OrganizationUser org={self.organization_id} user={self.user_id} role={self.role}>"
