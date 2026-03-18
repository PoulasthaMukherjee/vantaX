"""
Auth API endpoints.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import Organization, OrganizationUser, User
from app.schemas import (
    APIResponse,
    AuthMeResponse,
    OrganizationMembershipResponse,
    UserResponse,
)

router = APIRouter()


@router.get("/me", response_model=APIResponse[AuthMeResponse])
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current user's profile and organization memberships.

    This endpoint:
    - Returns user profile data
    - Lists all organizations the user belongs to with their roles
    """
    # Get user's organization memberships with org details
    memberships = (
        db.query(OrganizationUser, Organization)
        .join(Organization, OrganizationUser.organization_id == Organization.id)
        .filter(OrganizationUser.user_id == current_user.id)
        .filter(Organization.status == "active")
        .all()
    )

    # Build organization membership list
    org_memberships = [
        OrganizationMembershipResponse(
            organization_id=org.id,
            organization_name=org.name,
            organization_slug=org.slug,
            role=membership.role.value,
        )
        for membership, org in memberships
    ]

    return APIResponse(
        success=True,
        data=AuthMeResponse(
            user=UserResponse.model_validate(current_user),
            organizations=org_memberships,
        ),
    )
