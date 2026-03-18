"""
Profile API endpoints.

Handles candidate profile management (org-scoped).
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_org,
    get_current_user,
    get_db,
    require_not_maintenance,
)
from app.models.candidate_profile import CandidateProfile
from app.models.organization import Organization
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.profile import ProfileResponse, ProfileUpdate
from app.services.activity import ActivityType, log_activity

router = APIRouter()


# =============================================================================
# Profile Endpoints
# =============================================================================


def _get_or_create_profile(
    db: Session,
    org: Organization,
    user: User,
) -> CandidateProfile:
    """Get existing profile or create a new one."""
    profile = (
        db.query(CandidateProfile)
        .filter(
            CandidateProfile.organization_id == org.id,
            CandidateProfile.user_id == user.id,
        )
        .first()
    )

    if not profile:
        profile = CandidateProfile(
            organization_id=org.id,
            user_id=user.id,
            name=user.name,  # Pre-fill from user
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return profile


@router.get(
    "/me",
    response_model=APIResponse[ProfileResponse],
    summary="Get current user's profile",
)
async def get_my_profile(
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the current user's profile for the current organization.

    Creates a profile if one doesn't exist.
    """
    profile = _get_or_create_profile(db, org, user)

    return {
        "success": True,
        "data": ProfileResponse.model_validate(profile),
    }


@router.put(
    "/me",
    response_model=APIResponse[ProfileResponse],
    summary="Update current user's profile",
    dependencies=[Depends(require_not_maintenance)],
)
async def update_my_profile(
    data: ProfileUpdate,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the current user's profile for the current organization.

    Only updates fields that are provided (non-None).
    Awards points on profile completion.
    """
    profile = _get_or_create_profile(db, org, user)
    was_complete = profile.is_complete

    # Validate slug uniqueness if being changed
    update_data = data.model_dump(exclude_unset=True)
    if "slug" in update_data and update_data["slug"]:
        slug = update_data["slug"].lower()
        update_data["slug"] = slug  # Normalize to lowercase
        existing = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.slug == slug,
                CandidateProfile.id != profile.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SLUG_TAKEN",
                    "message": "This profile URL is already taken",
                },
            )

    # Track which fields were updated
    fields_updated = []

    # Update only provided fields
    for field, value in update_data.items():
        if hasattr(profile, field):
            old_value = getattr(profile, field)
            if old_value != value:
                setattr(profile, field, value)
                fields_updated.append(field)

    if fields_updated:
        db.commit()
        db.refresh(profile)

        # Log activity
        log_activity(
            db=db,
            organization_id=org.id,
            activity_type=ActivityType.PROFILE_UPDATED,
            message=f"Updated profile: {', '.join(fields_updated)}",
            actor_id=user.id,
            target_type="profile",
            target_id=profile.id,
            event_data={"fields": fields_updated},
        )

        # Award points if profile just became complete
        if not was_complete and profile.is_complete:
            # Import here to avoid circular imports
            from app.services.points import award_points

            award_points(
                db=db,
                user_id=user.id,
                organization_id=org.id,
                event="profile_complete",
            )

            log_activity(
                db=db,
                organization_id=org.id,
                activity_type=ActivityType.PROFILE_COMPLETED,
                message="Completed profile",
                actor_id=user.id,
                target_type="profile",
                target_id=profile.id,
            )

    return {
        "success": True,
        "data": ProfileResponse.model_validate(profile),
    }


@router.get(
    "/{profile_id}",
    response_model=APIResponse[ProfileResponse],
    summary="Get a profile by ID",
)
async def get_profile(
    profile_id: str,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a profile by ID.

    Only accessible to:
    - The profile owner
    - Org admins/owners
    - Anyone if the profile is public
    """
    from uuid import UUID

    try:
        pid = UUID(profile_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_PROFILE_ID",
                "message": "Invalid profile ID format",
            },
        )

    profile = (
        db.query(CandidateProfile)
        .filter(
            CandidateProfile.id == pid,
            CandidateProfile.organization_id == org.id,
        )
        .first()
    )

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PROFILE_NOT_FOUND", "message": "Profile not found"},
        )

    # Check access
    from app.models.organization_user import OrganizationUser

    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    is_owner = profile.user_id == user.id
    is_admin = membership and membership.role in ("owner", "admin", "reviewer")

    if not (is_owner or is_admin or profile.is_public):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCESS_DENIED",
                "message": "You don't have access to this profile",
            },
        )

    return {
        "success": True,
        "data": ProfileResponse.model_validate(profile),
    }


# =============================================================================
# Resume Upload Endpoints
# =============================================================================


@router.post(
    "/me/resume",
    response_model=APIResponse[ProfileResponse],
    summary="Upload resume",
    dependencies=[Depends(require_not_maintenance)],
)
async def upload_resume(
    file: UploadFile = File(...),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a resume for the current user's profile.

    Accepts PDF and DOCX files up to 20MB.
    Replaces any existing resume.
    Awards points on first resume upload.
    """
    from app.services.resume import delete_resume, save_resume

    profile = _get_or_create_profile(db, org, user)
    had_resume = profile.resume_file_path is not None

    # Validate and save the file
    result = await save_resume(
        user_id=user.id,
        file=file.file,
        filename=file.filename or "resume",
        content_type=file.content_type or "",
        file_size=file.size or 0,
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "UPLOAD_FAILED", "message": result.error},
        )

    # Delete old resume if exists
    if profile.resume_file_path:
        await delete_resume(profile.resume_file_path)

    # Update profile
    profile.resume_file_path = result.file_path
    profile.resume_filename = result.filename
    db.commit()
    db.refresh(profile)

    # Log activity
    log_activity(
        db=db,
        organization_id=org.id,
        activity_type=ActivityType.RESUME_UPLOADED,
        message="Uploaded resume",
        actor_id=user.id,
        target_type="profile",
        target_id=profile.id,
        event_data={"filename": result.filename},
    )

    # Award points if first resume
    if not had_resume:
        from app.services.points import award_points

        award_points(
            db=db,
            user_id=user.id,
            organization_id=org.id,
            event="resume_uploaded",
        )

    return {
        "success": True,
        "data": ProfileResponse.model_validate(profile),
    }


@router.delete(
    "/me/resume",
    response_model=APIResponse[ProfileResponse],
    summary="Delete resume",
    dependencies=[Depends(require_not_maintenance)],
)
async def delete_my_resume(
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete the current user's resume.
    """
    from app.services.resume import delete_resume

    profile = _get_or_create_profile(db, org, user)

    if not profile.resume_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_RESUME", "message": "No resume to delete"},
        )

    # Delete the file
    await delete_resume(profile.resume_file_path)

    # Update profile
    profile.resume_file_path = None
    profile.resume_filename = None
    db.commit()
    db.refresh(profile)

    return {
        "success": True,
        "data": ProfileResponse.model_validate(profile),
    }
