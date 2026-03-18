"""
Auth-related Pydantic schemas.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.schemas.common import OrmBase

# =============================================================================
# User Schemas
# =============================================================================


class UserBase(BaseModel):
    """Base user fields."""

    email: EmailStr
    name: str | None = None
    email_verified: bool = False


class UserResponse(UserBase, OrmBase):
    """User response schema."""

    id: UUID
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Organization Membership Schemas
# =============================================================================


class OrganizationMembershipResponse(OrmBase):
    """User's membership in an organization."""

    organization_id: UUID
    organization_name: str
    organization_slug: str
    role: str


# =============================================================================
# Auth Response Schemas
# =============================================================================


class AuthMeResponse(BaseModel):
    """Response for /auth/me endpoint."""

    user: UserResponse
    organizations: list[OrganizationMembershipResponse]
