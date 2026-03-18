"""
Organization API endpoints.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_org,
    get_current_user,
    get_db,
    require_not_maintenance,
    require_role,
)
from app.models import Organization, OrganizationUser, OrganizationUserRole, User
from app.schemas import (
    APIResponse,
    OrganizationCreate,
    OrganizationListResponse,
    OrganizationMemberAdd,
    OrganizationMemberResponse,
    OrganizationMemberUpdate,
    OrganizationResponse,
    OrganizationUpdate,
)

router = APIRouter()


# =============================================================================
# Organization CRUD
# =============================================================================


@router.get("", response_model=APIResponse[list[OrganizationListResponse]])
async def list_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List organizations the current user belongs to.
    """
    # Get user's organizations through memberships
    orgs = (
        db.query(Organization)
        .join(OrganizationUser, OrganizationUser.organization_id == Organization.id)
        .filter(OrganizationUser.user_id == current_user.id)
        .filter(Organization.status == "active")
        .all()
    )

    return APIResponse(
        success=True,
        data=[OrganizationListResponse.model_validate(org) for org in orgs],
    )


@router.post(
    "",
    response_model=APIResponse[OrganizationResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_not_maintenance)],
)
async def create_organization(
    data: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new organization.

    The creating user becomes the owner.
    """
    # Check slug uniqueness
    existing = db.query(Organization).filter(Organization.slug == data.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "SLUG_EXISTS",
                "message": "Organization with this slug already exists",
            },
        )

    # Create organization
    org = Organization(
        name=data.name,
        slug=data.slug,
        status="active",
        plan="free",
        created_by=current_user.id,
    )
    db.add(org)
    db.flush()

    # Add creator as owner
    membership = OrganizationUser(
        organization_id=org.id,
        user_id=current_user.id,
        role=OrganizationUserRole.OWNER,
    )
    db.add(membership)
    db.commit()
    db.refresh(org)

    return APIResponse(
        success=True,
        data=OrganizationResponse.model_validate(org),
    )


@router.get("/current", response_model=APIResponse[OrganizationResponse])
async def get_current_organization(
    org: Organization = Depends(get_current_org),
):
    """
    Get the current organization (from X-Organization-Id header).
    """
    return APIResponse(
        success=True,
        data=OrganizationResponse.model_validate(org),
    )


@router.patch(
    "/current",
    response_model=APIResponse[OrganizationResponse],
    dependencies=[Depends(require_not_maintenance)],
)
async def update_current_organization(
    data: OrganizationUpdate,
    org: Organization = Depends(get_current_org),
    _: OrganizationUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    """
    Update the current organization.

    Requires owner or admin role.
    """
    if data.name is not None:
        org.name = data.name

    db.commit()
    db.refresh(org)

    return APIResponse(
        success=True,
        data=OrganizationResponse.model_validate(org),
    )


# =============================================================================
# Organization Members
# =============================================================================


@router.get(
    "/current/members", response_model=APIResponse[list[OrganizationMemberResponse]]
)
async def list_organization_members(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    List all members of the current organization.
    """
    members = (
        db.query(OrganizationUser, User)
        .join(User, OrganizationUser.user_id == User.id)
        .filter(OrganizationUser.organization_id == org.id)
        .all()
    )

    return APIResponse(
        success=True,
        data=[
            OrganizationMemberResponse(
                user_id=user.id,
                email=user.email,
                name=user.name,
                role=membership.role.value,
                created_at=membership.created_at,
            )
            for membership, user in members
        ],
    )


@router.post(
    "/current/members",
    response_model=APIResponse[OrganizationMemberResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_not_maintenance)],
)
async def add_organization_member(
    data: OrganizationMemberAdd,
    org: Organization = Depends(get_current_org),
    _: OrganizationUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    """
    Add a member to the organization.

    Requires owner or admin role.
    The user must already exist in the system.
    """
    # Check user exists
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
        )

    # Check not already a member
    existing = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == data.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_MEMBER", "message": "User is already a member"},
        )

    # Create membership
    membership = OrganizationUser(
        organization_id=org.id,
        user_id=data.user_id,
        role=OrganizationUserRole(data.role),
    )
    db.add(membership)
    db.commit()

    return APIResponse(
        success=True,
        data=OrganizationMemberResponse(
            user_id=user.id,
            email=user.email,
            name=user.name,
            role=membership.role.value,
            created_at=membership.created_at,
        ),
    )


@router.patch(
    "/current/members/{user_id}",
    response_model=APIResponse[OrganizationMemberResponse],
    dependencies=[Depends(require_not_maintenance)],
)
async def update_organization_member(
    user_id: UUID,
    data: OrganizationMemberUpdate,
    org: Organization = Depends(get_current_org),
    current_membership: OrganizationUser = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update a member's role.

    Requires owner or admin role.
    Owners can only be changed by other owners.
    """
    # Get target membership
    target = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MEMBER_NOT_FOUND", "message": "Member not found"},
        )

    # Cannot change own role
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_CHANGE_OWN_ROLE",
                "message": "Cannot change your own role",
            },
        )

    # Only owners can modify other owners or promote to owner
    if target.role == OrganizationUserRole.OWNER or data.role == "owner":
        if current_membership.role != OrganizationUserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "OWNER_REQUIRED",
                    "message": "Only owners can modify owner roles",
                },
            )

    # Update role
    target.role = OrganizationUserRole(data.role)
    db.commit()

    # Get user info (user must exist since OrganizationUser references it)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
        )

    return APIResponse(
        success=True,
        data=OrganizationMemberResponse(
            user_id=user.id,
            email=user.email,
            name=user.name,
            role=target.role.value,
            created_at=target.created_at,
        ),
    )


@router.delete(
    "/current/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_not_maintenance)],
)
async def remove_organization_member(
    user_id: UUID,
    org: Organization = Depends(get_current_org),
    current_membership: OrganizationUser = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a member from the organization.

    Requires owner or admin role.
    Cannot remove self or the last owner.
    """
    # Get target membership
    target = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MEMBER_NOT_FOUND", "message": "Member not found"},
        )

    # Cannot remove self
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_REMOVE_SELF",
                "message": "Cannot remove yourself from the organization",
            },
        )

    # Only owners can remove other owners
    if target.role == OrganizationUserRole.OWNER:
        if current_membership.role != OrganizationUserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "OWNER_REQUIRED",
                    "message": "Only owners can remove other owners",
                },
            )

        # Check not last owner
        owner_count = (
            db.query(OrganizationUser)
            .filter(
                OrganizationUser.organization_id == org.id,
                OrganizationUser.role == OrganizationUserRole.OWNER,
            )
            .count()
        )
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "LAST_OWNER",
                    "message": "Cannot remove the last owner",
                },
            )

    db.delete(target)
    db.commit()
