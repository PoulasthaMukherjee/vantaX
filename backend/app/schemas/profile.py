"""
Candidate profile schemas.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmBase

# =============================================================================
# Profile Schemas
# =============================================================================


class ProfileBase(BaseModel):
    """Base profile fields (for creation/update)."""

    name: str | None = Field(None, max_length=255)
    mobile: str | None = Field(None, max_length=20)
    github_url: str | None = Field(None, max_length=500)
    linkedin_url: str | None = Field(None, max_length=500)
    about_me: str | None = Field(None, max_length=2000)
    skills: list[str] | None = Field(None, max_length=50)
    is_public: bool | None = None


class ProfileUpdate(ProfileBase):
    """Schema for updating a profile."""

    slug: str | None = Field(
        None, min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$"
    )


class ProfileResponse(OrmBase):
    """Profile response schema."""

    id: UUID
    organization_id: UUID
    user_id: UUID
    slug: str | None

    # Profile info
    name: str | None
    mobile: str | None

    # External links
    github_url: str | None
    github_verified: bool
    linkedin_url: str | None

    # Resume
    resume_file_path: str | None
    resume_filename: str | None

    # About
    about_me: str | None

    # Skills
    skills: list[str] | None

    # Scores
    vibe_score: Decimal
    total_points: int

    # Visibility
    is_public: bool

    # Timestamps
    created_at: datetime
    updated_at: datetime

    # Computed
    is_complete: bool


class ProfilePublicResponse(OrmBase):
    """Public profile response (limited fields, no PII)."""

    id: UUID
    slug: str | None
    name: str | None
    github_url: str | None
    github_verified: bool
    linkedin_url: str | None
    about_me: str | None
    skills: list[str] | None
    vibe_score: Decimal
    total_points: int
    # Note: No email, mobile, resume_file_path, organization_id


class TalentSearchParams(BaseModel):
    """Parameters for talent search."""

    q: str | None = Field(None, description="Search query (name, about_me)")
    min_vibe_score: float | None = Field(None, ge=0, le=100)
    github_verified: bool | None = None
    has_resume: bool | None = None
    skills: list[str] | None = Field(None, description="Filter by skills")
    event_id: UUID | None = Field(None, description="Filter by event participation")
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class TalentSearchResult(BaseModel):
    """Talent search result with pagination."""

    profiles: list[ProfilePublicResponse]
    total: int
    limit: int
    offset: int
