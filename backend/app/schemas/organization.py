"""
Organization-related Pydantic schemas.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmBase

# =============================================================================
# Organization Schemas
# =============================================================================


class OrganizationBase(BaseModel):
    """Base organization fields."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")


class OrganizationCreate(OrganizationBase):
    """Schema for creating an organization."""

    pass


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization."""

    name: str | None = Field(None, min_length=1, max_length=255)


class OrganizationResponse(OrganizationBase, OrmBase):
    """Organization response schema."""

    id: UUID
    status: str
    plan: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class OrganizationListResponse(OrmBase):
    """Simplified organization for lists."""

    id: UUID
    name: str
    slug: str
    status: str
    plan: str


# =============================================================================
# Organization Member Schemas
# =============================================================================


class OrganizationMemberBase(BaseModel):
    """Base member fields."""

    role: str = Field(..., pattern=r"^(owner|admin|reviewer|candidate)$")


class OrganizationMemberAdd(OrganizationMemberBase):
    """Schema for adding a member."""

    user_id: UUID


class OrganizationMemberUpdate(BaseModel):
    """Schema for updating a member's role."""

    role: str = Field(..., pattern=r"^(owner|admin|reviewer|candidate)$")


class OrganizationMemberResponse(OrmBase):
    """Organization member response."""

    user_id: UUID
    email: str
    name: str | None
    role: str
    created_at: datetime


# =============================================================================
# Admin Invite Schemas
# =============================================================================


class AdminInviteCreate(BaseModel):
    """Schema for creating an admin invite."""

    email: str = Field(..., min_length=5, max_length=255)
    role: str = Field(..., pattern=r"^(admin|reviewer)$")


class AdminInviteResponse(OrmBase):
    """Admin invite response schema."""

    id: UUID
    email: str
    role: str
    invited_by: UUID
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime

    @property
    def is_expired(self) -> bool:
        """Check if invite has expired."""
        from datetime import datetime as dt

        return dt.utcnow() > self.expires_at

    @property
    def is_pending(self) -> bool:
        """Check if invite is still pending."""
        return self.accepted_at is None and not self.is_expired


class AdminInviteAccept(BaseModel):
    """Schema for accepting an admin invite."""

    invite_id: UUID
