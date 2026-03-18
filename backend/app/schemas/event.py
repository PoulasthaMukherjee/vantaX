"""
Event schemas for hackathons and competitions.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import OrmBase

# =============================================================================
# Event Schemas
# =============================================================================


class SponsorInfo(BaseModel):
    """Sponsor information."""

    name: str
    logo_url: str | None = None
    website_url: str | None = None
    tier: str | None = None  # e.g., "gold", "silver", "bronze"


class EventBase(BaseModel):
    """Base event fields."""

    title: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    short_description: str | None = Field(None, max_length=500)

    # Branding
    banner_url: str | None = None
    logo_url: str | None = None
    theme_color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")

    # Status and visibility
    visibility: str = Field(default="public", pattern=r"^(public|invite_only|private)$")

    # Time window
    starts_at: datetime
    ends_at: datetime
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None

    # Caps and limits
    max_participants: int | None = Field(None, ge=1)
    max_submissions_per_user: int = Field(default=1, ge=1, le=10)

    # Rules and info
    rules: str | None = None
    prizes: str | None = None
    sponsors: list[SponsorInfo] | None = None

    # Certificate settings
    certificates_enabled: bool = True
    certificate_template: str | None = None
    min_score_for_certificate: int = Field(default=0, ge=0, le=100)

    # Tags
    tags: list[str] | None = None

    @field_validator("ends_at")
    @classmethod
    def ends_at_after_starts_at(cls, v: datetime, info) -> datetime:
        if "starts_at" in info.data and v <= info.data["starts_at"]:
            raise ValueError("ends_at must be after starts_at")
        return v


class EventCreate(EventBase):
    """Schema for creating an event."""

    # Assessment IDs to link
    assessment_ids: list[UUID] | None = None


class EventUpdate(BaseModel):
    """Schema for updating an event."""

    title: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(
        None, min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$"
    )
    description: str | None = None
    short_description: str | None = Field(None, max_length=500)

    banner_url: str | None = None
    logo_url: str | None = None
    theme_color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")

    status: str | None = Field(
        None, pattern=r"^(draft|upcoming|active|ended|archived)$"
    )
    visibility: str | None = Field(None, pattern=r"^(public|invite_only|private)$")

    starts_at: datetime | None = None
    ends_at: datetime | None = None
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None

    max_participants: int | None = Field(None, ge=1)
    max_submissions_per_user: int | None = Field(None, ge=1, le=10)

    rules: str | None = None
    prizes: str | None = None
    sponsors: list[SponsorInfo] | None = None

    certificates_enabled: bool | None = None
    certificate_template: str | None = None
    min_score_for_certificate: int | None = Field(None, ge=0, le=100)

    tags: list[str] | None = None


class EventResponse(OrmBase):
    """Full event response schema."""

    id: UUID
    organization_id: UUID
    created_by: UUID

    title: str
    slug: str
    description: str | None
    short_description: str | None

    banner_url: str | None
    logo_url: str | None
    theme_color: str | None

    status: str
    visibility: str

    starts_at: datetime
    ends_at: datetime
    registration_opens_at: datetime | None
    registration_closes_at: datetime | None

    max_participants: int | None
    max_submissions_per_user: int

    rules: str | None
    prizes: str | None
    sponsors: list[dict[str, Any]] | None

    certificates_enabled: bool
    certificate_template: str | None
    min_score_for_certificate: int

    tags: list[str] | None

    created_at: datetime
    updated_at: datetime

    # Computed fields (populated by API)
    participant_count: int | None = None
    is_registered: bool | None = None
    assessment_count: int | None = None


class EventListResponse(OrmBase):
    """Simplified event for list views."""

    id: UUID
    title: str
    slug: str
    short_description: str | None
    banner_url: str | None
    status: str
    visibility: str
    starts_at: datetime
    ends_at: datetime
    max_participants: int | None
    tags: list[str] | None
    created_at: datetime

    # Computed
    participant_count: int | None = None


# =============================================================================
# Event Registration Schemas
# =============================================================================


class EventRegistrationResponse(OrmBase):
    """Event registration response."""

    id: UUID
    event_id: UUID
    user_id: UUID
    registered_at: datetime
    certificate_issued: bool
    certificate_issued_at: datetime | None
    certificate_url: str | None


# =============================================================================
# Event Assessment Link Schemas
# =============================================================================


class EventAssessmentCreate(BaseModel):
    """Schema for linking an assessment to an event."""

    assessment_id: UUID
    display_order: int = 0
    points_multiplier: float = Field(default=1.0, ge=0.1, le=10.0)


class EventAssessmentResponse(OrmBase):
    """Event-assessment link response."""

    id: UUID
    event_id: UUID
    assessment_id: UUID
    display_order: int
    points_multiplier: float

    # Assessment details (populated by API)
    assessment_title: str | None = None


# =============================================================================
# Event Leaderboard Schemas
# =============================================================================


class EventLeaderboardEntry(BaseModel):
    """Single entry in event leaderboard."""

    rank: int
    user_id: UUID
    user_name: str | None
    total_score: float
    submission_count: int
    best_submission_id: UUID | None
    evaluated_at: datetime | None


class EventLeaderboardResponse(BaseModel):
    """Event leaderboard response."""

    event_id: UUID
    event_title: str
    total_participants: int
    entries: list[EventLeaderboardEntry]


# =============================================================================
# Certificate Schemas
# =============================================================================


class CertificateRequest(BaseModel):
    """Request to generate a certificate."""

    pass  # No additional fields needed, uses event defaults


class CertificateResponse(BaseModel):
    """Certificate generation response."""

    certificate_url: str
    issued_at: datetime


# =============================================================================
# Event Invite Schemas
# =============================================================================


class EventInviteCreate(BaseModel):
    """Schema for creating an event invite."""

    email: str = Field(..., description="Email address to invite")


class EventInviteBulkCreate(BaseModel):
    """Schema for creating multiple event invites."""

    emails: list[str] = Field(..., min_length=1, max_length=100)


class EventInviteResponse(OrmBase):
    """Event invite response."""

    id: UUID
    event_id: UUID
    email: str
    user_id: UUID | None
    invited_by: UUID
    invited_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None

    # Populated by API
    inviter_name: str | None = None
    user_name: str | None = None
