"""
AdminInvite model - org-scoped admin/reviewer invitations.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.organization_user import OrganizationUserRole

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class AdminInvite(BaseModel):
    """
    Admin/reviewer invitation for an organization.

    Only owners/admins can invite new admins/reviewers.
    Invites expire after a set period (default 7 days).
    """

    __tablename__ = "admin_invites"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_admin_invites_org_email"),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # Invite details
    email: Mapped[str] = mapped_column(String(255))
    role: Mapped[OrganizationUserRole] = mapped_column(
        Enum(OrganizationUserRole, name="organization_user_role", create_type=False)
    )

    # Who invited
    invited_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Expiration and acceptance
    expires_at: Mapped[datetime] = mapped_column()
    accepted_at: Mapped[datetime | None] = mapped_column()

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="admin_invites")
    inviter: Mapped["User"] = relationship(foreign_keys=[invited_by])

    def __repr__(self) -> str:
        return f"<AdminInvite {self.email} -> {self.organization_id} as {self.role}>"

    @property
    def is_expired(self) -> bool:
        """Check if invite has expired."""
        return datetime.utcnow() > self.expires_at

    @property
    def is_accepted(self) -> bool:
        """Check if invite has been accepted."""
        return self.accepted_at is not None
