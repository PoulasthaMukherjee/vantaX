"""
Event model - org-scoped hackathons and coding competitions.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ARRAY, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.enums import EventStatus, EventVisibility

if TYPE_CHECKING:
    from app.models.assessment import Assessment
    from app.models.organization import Organization
    from app.models.submission import Submission
    from app.models.user import User


class Event(BaseModel):
    """
    Event (hackathon/competition) scoped to an organization.

    Events have a time window, submission caps, and link to assessments.
    Supports certificates and event-specific leaderboards.
    """

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_events_org_slug"),
        Index("idx_events_org_status", "organization_id", "status"),
        Index("idx_events_dates", "starts_at", "ends_at"),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # Creator
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Basic info
    title: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    short_description: Mapped[str | None] = mapped_column(String(500))

    # Branding
    banner_url: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(Text)
    theme_color: Mapped[str | None] = mapped_column(String(7))  # Hex color

    # Status and visibility
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status", values_callable=lambda x: [e.value for e in x]),
        default=EventStatus.DRAFT,
    )
    visibility: Mapped[EventVisibility] = mapped_column(
        Enum(EventVisibility, name="event_visibility", values_callable=lambda x: [e.value for e in x]),
        default=EventVisibility.PUBLIC,
    )

    # Time window
    starts_at: Mapped[datetime] = mapped_column()
    ends_at: Mapped[datetime] = mapped_column()
    registration_opens_at: Mapped[datetime | None] = mapped_column()
    registration_closes_at: Mapped[datetime | None] = mapped_column()

    # Caps and limits
    max_participants: Mapped[int | None] = mapped_column()
    max_submissions_per_user: Mapped[int] = mapped_column(default=1)

    # Rules and info
    rules: Mapped[str | None] = mapped_column(Text)
    prizes: Mapped[str | None] = mapped_column(Text)
    sponsors: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)

    # Certificate settings
    certificates_enabled: Mapped[bool] = mapped_column(default=True)
    certificate_template: Mapped[str | None] = mapped_column(Text)
    min_score_for_certificate: Mapped[int] = mapped_column(default=0)

    # Tags for filtering
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="events")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    registrations: Mapped[list["EventRegistration"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )
    event_assessments: Mapped[list["EventAssessment"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="event",
        foreign_keys="Submission.event_id",
    )
    invites: Mapped[list["EventInvite"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Event {self.title} ({self.status})>"

    @property
    def is_active(self) -> bool:
        """Check if event is currently active."""
        now = datetime.utcnow()
        return (
            self.status == EventStatus.ACTIVE and self.starts_at <= now <= self.ends_at
        )

    @property
    def is_registration_open(self) -> bool:
        """Check if registration is currently open."""
        now = datetime.utcnow()
        if self.status not in (EventStatus.UPCOMING, EventStatus.ACTIVE):
            return False
        if self.registration_opens_at and now < self.registration_opens_at:
            return False
        if self.registration_closes_at and now > self.registration_closes_at:
            return False
        return True

    @property
    def has_ended(self) -> bool:
        """Check if event has ended."""
        return datetime.utcnow() > self.ends_at


class EventRegistration(BaseModel):
    """
    Registration of a user for an event.

    Tracks when users join events and their participation status.
    """

    __tablename__ = "event_registrations"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "user_id", name="uq_event_registrations_event_user"
        ),
        Index("idx_event_registrations_event", "event_id"),
        Index("idx_event_registrations_user", "user_id"),
    )

    # Event reference
    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
    )

    # User reference
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
    )

    # Registration details
    registered_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Certificate tracking
    certificate_issued: Mapped[bool] = mapped_column(default=False)
    certificate_issued_at: Mapped[datetime | None] = mapped_column()
    certificate_url: Mapped[str | None] = mapped_column(Text)

    # Relationships
    event: Mapped["Event"] = relationship(back_populates="registrations")
    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<EventRegistration event={self.event_id} user={self.user_id}>"


class EventInvite(BaseModel):
    """
    Invitation to an invite_only event.

    For events with visibility=INVITE_ONLY, users must have an invite to register.
    Invites can be sent by email (before user exists) or to existing users.
    """

    __tablename__ = "event_invites"
    __table_args__ = (
        UniqueConstraint("event_id", "email", name="uq_event_invites_event_email"),
        Index("idx_event_invites_event", "event_id"),
        Index("idx_event_invites_email", "email"),
    )

    # Event reference
    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
    )

    # Invite target - email is required, user_id is set when email matches a user
    email: Mapped[str] = mapped_column(String(255))
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    # Who sent the invite
    invited_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Invite status
    invited_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column()
    revoked_at: Mapped[datetime | None] = mapped_column()

    # Relationships
    event: Mapped["Event"] = relationship(back_populates="invites")
    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
    inviter: Mapped["User"] = relationship(foreign_keys=[invited_by])

    def __repr__(self) -> str:
        return f"<EventInvite event={self.event_id} email={self.email}>"

    @property
    def is_valid(self) -> bool:
        """Check if invite is still valid (not revoked)."""
        return self.revoked_at is None


class EventAssessment(BaseModel):
    """
    Link between events and assessments.

    An event can have multiple assessments, and assessments can be in multiple events.
    """

    __tablename__ = "event_assessments"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "assessment_id", name="uq_event_assessments_event_assessment"
        ),
    )

    # Event reference
    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        index=True,
    )

    # Assessment reference
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"),
        index=True,
    )

    # Ordering within the event
    display_order: Mapped[int] = mapped_column(default=0)

    # Optional overrides for this event
    points_multiplier: Mapped[float] = mapped_column(default=1.0)

    # Relationships
    event: Mapped["Event"] = relationship(back_populates="event_assessments")
    assessment: Mapped["Assessment"] = relationship()

    def __repr__(self) -> str:
        return (
            f"<EventAssessment event={self.event_id} assessment={self.assessment_id}>"
        )
