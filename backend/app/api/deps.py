"""
FastAPI dependencies for authentication, authorization, and common operations.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import DecodedToken, verify_firebase_token

logger = logging.getLogger(__name__)


# =============================================================================
# Authentication Dependencies
# =============================================================================


async def get_token_from_header(
    authorization: str = Header(..., description="Bearer token")
) -> str:
    """
    Extract token from Authorization header.

    Expected format: "Bearer <token>"
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "AUTH_INVALID_FORMAT",
                "message": "Authorization header must start with 'Bearer '",
            },
        )
    return authorization[7:]  # Remove "Bearer " prefix


async def get_current_user_token(
    token: str = Depends(get_token_from_header),
) -> DecodedToken:
    """
    Verify Firebase token and return decoded data.
    Does NOT access database - just validates the token.
    """
    try:
        return verify_firebase_token(token)
    except ValueError as e:
        error_msg = str(e)
        if "expired" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "AUTH_TOKEN_EXPIRED", "message": "Token has expired"},
            )
        elif "revoked" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "AUTH_TOKEN_REVOKED",
                    "message": "Token has been revoked",
                },
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "AUTH_TOKEN_INVALID", "message": "Invalid token"},
            )


# Forward declaration - actual User model will be imported after models are created
# This prevents circular imports
def _get_user_model():
    from app.models.user import User

    return User


def _get_organization_model():
    from app.models.organization import Organization

    return Organization


def _get_organization_user_model():
    from app.models.organization_user import OrganizationUser

    return OrganizationUser


async def get_current_user(
    request: Request,
    token: DecodedToken = Depends(get_current_user_token),
    db: Session = Depends(get_db),
):
    """
    Get or create user from Firebase token.
    Upserts user on first API call.

    Also sets request.state.user_id for rate limiting.

    Returns:
        User: SQLAlchemy User model instance
    """
    User = _get_user_model()

    # Try to find existing user
    user = db.query(User).filter(User.firebase_uid == token.uid).first()

    if user is None:
        # Create new user on first API call
        user = User(
            firebase_uid=token.uid,
            email=token.email,
            name=token.name,
            email_verified=token.email_verified,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Created new user: {user.id} ({user.email})")

    elif token.email_verified and not user.email_verified:
        # Update email_verified status if changed
        user.email_verified = True
        db.commit()

    # Set user_id on request state for rate limiting middleware
    request.state.user_id = str(user.id)

    return user


async def get_current_verified_user(
    user=Depends(get_current_user),
):
    """
    Require email-verified user.
    Use for sensitive operations.
    """
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Please verify your email address",
            },
        )
    return user


# =============================================================================
# Organization Dependencies
# =============================================================================


async def get_org_id_from_header(
    x_organization_id: str = Header(
        ..., alias="X-Organization-Id", description="Organization UUID"
    )
) -> UUID:
    """
    Extract and validate organization ID from header.
    """
    try:
        return UUID(x_organization_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_ORG_ID",
                "message": "X-Organization-Id must be a valid UUID",
            },
        )


async def get_current_org(
    org_id: UUID = Depends(get_org_id_from_header),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validate organization exists, is active, and user is a member.

    Returns:
        Organization: SQLAlchemy Organization model instance
    """
    Organization = _get_organization_model()
    OrganizationUser = _get_organization_user_model()

    # Find organization
    org = (
        db.query(Organization)
        .filter(
            Organization.id == org_id,
        )
        .first()
    )

    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ORG_NOT_FOUND", "message": "Organization not found"},
        )

    # Check organization status
    if org.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ORG_SUSPENDED", "message": "Organization is suspended"},
        )

    # Check membership
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "NOT_ORG_MEMBER",
                "message": "You are not a member of this organization",
            },
        )

    return org


async def get_current_membership(
    org=Depends(get_current_org),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the current user's membership in the current organization.

    Returns:
        OrganizationUser: Membership record with role
    """
    OrganizationUser = _get_organization_user_model()

    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    return membership


def require_role(*allowed_roles: str):
    """
    Dependency factory for role-based access control.

    Usage:
        @router.post("/admin-only")
        async def admin_endpoint(
            membership: OrganizationUser = Depends(require_role("admin", "owner"))
        ):
            ...

    Args:
        *allowed_roles: Role names that are allowed (e.g., "owner", "admin", "reviewer")

    Returns:
        Dependency function that validates role
    """

    async def role_checker(
        membership=Depends(get_current_membership),
    ):
        if membership.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_ROLE",
                    "message": f"This action requires one of: {', '.join(allowed_roles)}",
                },
            )
        return membership

    return role_checker


# =============================================================================
# System Config Dependencies
# =============================================================================


def _get_system_config_model():
    from app.models.system_config import SystemConfig

    return SystemConfig


async def check_maintenance_mode(
    db: Session = Depends(get_db),
) -> bool:
    """
    Check if system is in maintenance mode.
    Returns True if maintenance mode is active.
    """
    SystemConfig = _get_system_config_model()
    return SystemConfig.is_maintenance_mode(db)


async def require_not_maintenance(
    is_maintenance: bool = Depends(check_maintenance_mode),
):
    """
    Dependency that blocks requests during maintenance mode.
    Use on endpoints that should be disabled during maintenance.
    """
    if is_maintenance:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "MAINTENANCE_MODE",
                "message": "System is under maintenance. Please try again later.",
            },
        )
