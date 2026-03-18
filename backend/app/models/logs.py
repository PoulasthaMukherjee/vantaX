"""
Log models - PointsLog, ActivityLog, AdminAuditLog.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class PointsLog(Base):
    """
    Log of point awards for gamification.

    Unique constraint on (organization_id, user_id, event) prevents duplicate awards.
    """

    __tablename__ = "points_log"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "user_id", "event", name="uq_points_log_org_user_event"
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # User who earned points
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    # Event details
    event: Mapped[str] = mapped_column(String(100))
    points: Mapped[int] = mapped_column()
    event_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship()
    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<PointsLog {self.event}: {self.points} pts>"


class ActivityLog(Base):
    """
    Activity feed log for notifications and history.

    Org-scoped, tracks significant events.
    """

    __tablename__ = "activity_log"
    __table_args__ = (
        Index("idx_activity_log_org", "organization_id", "created_at"),
        Index("idx_activity_log_target", "target_type", "target_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )

    # Event details
    type: Mapped[str] = mapped_column(String(50))
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[UUID | None] = mapped_column()
    message: Mapped[str] = mapped_column(Text)
    event_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship()
    actor: Mapped["User | None"] = relationship()

    def __repr__(self) -> str:
        return f"<ActivityLog {self.type}: {self.message[:50]}>"


class AdminAuditLog(Base):
    """
    Audit log for admin actions.

    Required for accountability on sensitive operations.
    """

    __tablename__ = "admin_audit_log"
    __table_args__ = (
        Index("idx_audit_log_org", "organization_id", "created_at"),
        Index("idx_audit_log_admin", "admin_id"),
        Index("idx_audit_log_target", "target_type", "target_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )

    # Admin who performed action
    admin_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Action details
    action: Mapped[str] = mapped_column(String(100))
    target_type: Mapped[str] = mapped_column(String(50))
    target_id: Mapped[UUID] = mapped_column()

    # Change tracking
    old_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    reason: Mapped[str | None] = mapped_column(Text)

    # Request context
    ip_address: Mapped[str | None] = mapped_column(INET)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship()
    admin: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<AdminAuditLog {self.action} on {self.target_type}:{self.target_id}>"
