"""
Public profile endpoints (no authentication required).

These endpoints allow viewing public profiles without logging in.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.candidate_profile import CandidateProfile
from app.schemas.common import APIResponse
from app.schemas.profile import ProfilePublicResponse

router = APIRouter()


def _parse_uuid(value: str) -> UUID | None:
    """Parse a UUID string, returning None if invalid."""
    try:
        return UUID(value)
    except ValueError:
        return None


@router.get(
    "/{id_or_slug}",
    response_model=APIResponse[ProfilePublicResponse],
    summary="Get public profile",
)
async def get_public_profile(
    id_or_slug: str,
    db: Session = Depends(get_db),
):
    """
    Get a public profile by ID or slug.

    Returns profile data only if is_public=true.
    No authentication required.
    """
    # Try to find by UUID first, then by slug
    uuid_value = _parse_uuid(id_or_slug)
    if uuid_value:
        profile = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.id == uuid_value,
                CandidateProfile.is_public.is_(True),
            )
            .first()
        )
    else:
        profile = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.slug == id_or_slug.lower(),
                CandidateProfile.is_public.is_(True),
            )
            .first()
        )

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PROFILE_NOT_FOUND",
                "message": "Profile not found or not public",
            },
        )

    return {
        "success": True,
        "data": ProfilePublicResponse(
            id=profile.id,
            slug=profile.slug,
            name=profile.name,
            github_url=profile.github_url,
            github_verified=profile.github_verified,
            linkedin_url=profile.linkedin_url,
            about_me=profile.about_me,
            skills=profile.skills,
            vibe_score=profile.vibe_score,
            total_points=profile.total_points,
        ),
    }
