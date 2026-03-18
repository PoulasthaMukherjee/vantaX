"""
Admin invites API endpoints.

Only owners/admins can invite new admins/reviewers.
Invites expire after 7 days.
"""

from datetime import datetime, timedelta
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
from app.models.admin_invite import AdminInvite
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser, OrganizationUserRole
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.organization import AdminInviteCreate, AdminInviteResponse

router = APIRouter()

# Invite expiration in days
INVITE_EXPIRATION_DAYS = 7


# =============================================================================
# Admin Invite Endpoints
# =============================================================================


@router.get(
    "/invites",
    response_model=APIResponse[list[AdminInviteResponse]],
    summary="List admin invites",
)
async def list_admin_invites(
    pending_only: bool = True,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    List admin invites for the current organization.

    Only owners and admins can view invites.
    By default, only shows pending (not expired, not accepted) invites.
    """
    query = db.query(AdminInvite).filter(AdminInvite.organization_id == org.id)

    if pending_only:
        query = query.filter(
            AdminInvite.accepted_at.is_(None),
            AdminInvite.expires_at > datetime.utcnow(),
        )

    invites = query.order_by(AdminInvite.created_at.desc()).all()

    return {
        "success": True,
        "data": [AdminInviteResponse.model_validate(i) for i in invites],
    }


@router.post(
    "/invites",
    response_model=APIResponse[AdminInviteResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create admin invite",
    dependencies=[Depends(require_not_maintenance)],
)
async def create_admin_invite(
    data: AdminInviteCreate,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create an admin invite for the current organization.

    Only owners and admins can create invites.
    Admins cannot invite owners.
    Invites expire after 7 days.

    Returns 409 if a pending invite already exists for this email.
    """
    # Admins cannot invite owners
    if data.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "CANNOT_INVITE_OWNER", "message": "Cannot invite owners"},
        )

    # Admins can only invite reviewers, not other admins
    if membership.role == "admin" and data.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "CANNOT_INVITE_ADMIN",
                "message": "Admins can only invite reviewers",
            },
        )

    # Check if user is already a member
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        existing_membership = (
            db.query(OrganizationUser)
            .filter(
                OrganizationUser.organization_id == org.id,
                OrganizationUser.user_id == existing_user.id,
            )
            .first()
        )
        if existing_membership:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "ALREADY_MEMBER",
                    "message": "User is already a member of this organization",
                },
            )

    # Check for existing pending invite
    existing_invite = (
        db.query(AdminInvite)
        .filter(
            AdminInvite.organization_id == org.id,
            AdminInvite.email == data.email,
            AdminInvite.accepted_at.is_(None),
            AdminInvite.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if existing_invite:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVITE_EXISTS",
                "message": "A pending invite already exists for this email",
            },
        )

    # Create invite
    invite = AdminInvite(
        organization_id=org.id,
        email=data.email,
        role=OrganizationUserRole(data.role),
        invited_by=user.id,
        expires_at=datetime.utcnow() + timedelta(days=INVITE_EXPIRATION_DAYS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Send invite email via Brevo (fire and forget)
    from app.core.config import settings
    from app.services.email import send_admin_invite_email

    invite_url = f"{settings.frontend_url}/invites/{invite.id}/accept"

    # Don't await - let email send in background
    import asyncio

    asyncio.create_task(
        send_admin_invite_email(
            to_email=data.email,
            to_name=None,
            organization_name=org.name,
            role=data.role,
            inviter_name=user.name or user.email,
            invite_url=invite_url,
        )
    )

    return {
        "success": True,
        "data": AdminInviteResponse.model_validate(invite),
    }


@router.delete(
    "/invites/{invite_id}",
    response_model=APIResponse[None],
    summary="Revoke admin invite",
    dependencies=[Depends(require_not_maintenance)],
)
async def revoke_admin_invite(
    invite_id: UUID,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    Revoke (delete) an admin invite.

    Only owners and admins can revoke invites.
    """
    invite = (
        db.query(AdminInvite)
        .filter(
            AdminInvite.id == invite_id,
            AdminInvite.organization_id == org.id,
        )
        .first()
    )

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITE_NOT_FOUND", "message": "Invite not found"},
        )

    if invite.accepted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVITE_ALREADY_ACCEPTED",
                "message": "Cannot revoke an accepted invite",
            },
        )

    db.delete(invite)
    db.commit()

    return {"success": True, "data": None}


@router.post(
    "/invites/{invite_id}/accept",
    response_model=APIResponse[None],
    summary="Accept admin invite",
    dependencies=[Depends(require_not_maintenance)],
)
async def accept_admin_invite(
    invite_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accept an admin invite.

    The invite must be for the current user's email.
    Creates the organization membership on acceptance.

    Note: This endpoint does NOT require X-Organization-Id header
    since the user may not be a member yet.
    """
    invite = db.query(AdminInvite).filter(AdminInvite.id == invite_id).first()

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITE_NOT_FOUND", "message": "Invite not found"},
        )

    # Check email matches
    if invite.email.lower() != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_MISMATCH",
                "message": "This invite is for a different email address",
            },
        )

    # Check not expired
    if invite.is_expired:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "INVITE_EXPIRED", "message": "This invite has expired"},
        )

    # Check not already accepted
    if invite.is_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVITE_ALREADY_ACCEPTED",
                "message": "This invite has already been accepted",
            },
        )

    # Check not already a member (race condition protection)
    existing_membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == invite.organization_id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    if existing_membership:
        # Mark invite as accepted anyway
        invite.accepted_at = datetime.utcnow()
        db.commit()
        return {"success": True, "data": None}

    # Create membership
    membership = OrganizationUser(
        organization_id=invite.organization_id,
        user_id=user.id,
        role=invite.role,
    )
    db.add(membership)

    # Mark invite as accepted
    invite.accepted_at = datetime.utcnow()
    db.commit()

    # Log activity
    from app.services.activity import log_member_joined

    log_member_joined(
        db=db,
        organization_id=invite.organization_id,
        user_id=user.id,
        role=invite.role.value,
        invited_by=invite.invited_by,
    )

    return {"success": True, "data": None}
