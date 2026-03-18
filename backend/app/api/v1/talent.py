"""
Talent API endpoints.

Provides talent search across public profiles (for companies)
and shortlist management.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_org, get_current_user, get_db, require_role
from app.models.candidate_profile import CandidateProfile
from app.models.event import EventRegistration
from app.models.organization import Organization
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.profile import ProfilePublicResponse, TalentSearchResult

router = APIRouter()


# =============================================================================
# Talent Search
# =============================================================================


@router.get(
    "/search",
    response_model=APIResponse[TalentSearchResult],
    summary="Search public profiles",
    dependencies=[Depends(require_role("owner", "admin", "reviewer"))],
)
async def search_talent(
    q: str | None = Query(None, description="Search query (name, about_me)"),
    min_vibe_score: float | None = Query(None, ge=0, le=100),
    github_verified: bool | None = None,
    has_resume: bool | None = None,
    skills: list[str] | None = Query(None),
    event_id: UUID | None = Query(None, description="Filter by event participation"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    Search public profiles across the platform.

    Returns profiles where is_public=true, with various filters.
    Only accessible to org admins/owners/reviewers.
    """
    # Base query: only public profiles
    query = db.query(CandidateProfile).filter(
        CandidateProfile.is_public == True,
    )

    # Text search
    if q:
        search_term = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(CandidateProfile.name).like(search_term),
                func.lower(CandidateProfile.about_me).like(search_term),
            )
        )

    # Vibe score filter
    if min_vibe_score is not None:
        query = query.filter(
            CandidateProfile.vibe_score >= Decimal(str(min_vibe_score))
        )

    # GitHub verified filter
    if github_verified is not None:
        query = query.filter(CandidateProfile.github_verified == github_verified)

    # Has resume filter
    if has_resume is not None:
        if has_resume:
            query = query.filter(CandidateProfile.resume_file_path.isnot(None))
        else:
            query = query.filter(CandidateProfile.resume_file_path.is_(None))

    # Skills filter (any match)
    if skills:
        query = query.filter(CandidateProfile.skills.overlap(skills))

    # Event participation filter
    if event_id:
        registered_user_ids = (
            db.query(EventRegistration.user_id)
            .filter(
                EventRegistration.event_id == event_id,
            )
            .scalar_subquery()
        )
        query = query.filter(CandidateProfile.user_id.in_(registered_user_ids))

    # Get total count
    total = query.count()

    # Get paginated results, ordered by vibe score descending
    profiles = (
        query.order_by(CandidateProfile.vibe_score.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Convert to response format
    result_profiles = [
        ProfilePublicResponse(
            id=p.id,
            slug=p.slug,
            name=p.name,
            github_url=p.github_url,
            github_verified=p.github_verified,
            linkedin_url=p.linkedin_url,
            about_me=p.about_me,
            skills=p.skills,
            vibe_score=p.vibe_score,
            total_points=p.total_points,
        )
        for p in profiles
    ]

    return {
        "success": True,
        "data": TalentSearchResult(
            profiles=result_profiles,
            total=total,
            limit=limit,
            offset=offset,
        ),
    }


# =============================================================================
# Shortlist Management
# =============================================================================


from pydantic import BaseModel, Field


class ShortlistCreate(BaseModel):
    """Schema for adding a profile to shortlist."""

    profile_id: UUID
    notes: str | None = Field(None, max_length=1000)


class ShortlistUpdate(BaseModel):
    """Schema for updating shortlist notes."""

    notes: str | None = Field(None, max_length=1000)


class ShortlistResponse(BaseModel):
    """Shortlist entry response."""

    id: UUID
    organization_id: UUID
    profile_id: UUID
    added_by: UUID
    notes: str | None
    created_at: datetime
    # Profile details
    profile: ProfilePublicResponse | None = None


from app.models.talent_shortlist import TalentShortlist


@router.get(
    "/shortlist",
    response_model=APIResponse[list[ShortlistResponse]],
    summary="Get shortlisted profiles",
    dependencies=[Depends(require_role("owner", "admin", "reviewer"))],
)
async def get_shortlist(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Get all shortlisted profiles for the organization."""
    try:
        shortlist_entries = (
            db.query(TalentShortlist)
            .filter(TalentShortlist.organization_id == org.id)
            .order_by(TalentShortlist.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"Failed to fetch shortlist: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DATABASE_ERROR", "message": "Failed to fetch shortlist"},
        )

    # Build response with profile details
    result = []
    for entry in shortlist_entries:
        profile = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.id == entry.profile_id,
            )
            .first()
        )

        profile_response = None
        if profile:
            profile_response = ProfilePublicResponse(
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
            )

        result.append(
            ShortlistResponse(
                id=entry.id,
                organization_id=entry.organization_id,
                profile_id=entry.profile_id,
                added_by=entry.added_by,
                notes=entry.notes,
                created_at=entry.created_at,
                profile=profile_response,
            )
        )

    return {"success": True, "data": result}


@router.post(
    "/shortlist",
    response_model=APIResponse[ShortlistResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add profile to shortlist",
    dependencies=[Depends(require_role("owner", "admin", "reviewer"))],
)
async def add_to_shortlist(
    data: ShortlistCreate,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a public profile to the organization's shortlist."""
    # Verify profile exists and is public
    profile = (
        db.query(CandidateProfile)
        .filter(
            CandidateProfile.id == data.profile_id,
            CandidateProfile.is_public == True,
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

    # Check if already shortlisted
    existing = (
        db.query(TalentShortlist)
        .filter(
            TalentShortlist.organization_id == org.id,
            TalentShortlist.profile_id == data.profile_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_SHORTLISTED",
                "message": "Profile is already in shortlist",
            },
        )

    # Create shortlist entry
    entry = TalentShortlist(
        organization_id=org.id,
        profile_id=data.profile_id,
        added_by=user.id,
        notes=data.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    profile_response = ProfilePublicResponse(
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
    )

    return {
        "success": True,
        "data": ShortlistResponse(
            id=entry.id,
            organization_id=entry.organization_id,
            profile_id=entry.profile_id,
            added_by=entry.added_by,
            notes=entry.notes,
            created_at=entry.created_at,
            profile=profile_response,
        ),
    }


@router.patch(
    "/shortlist/{entry_id}",
    response_model=APIResponse[ShortlistResponse],
    summary="Update shortlist notes",
    dependencies=[Depends(require_role("owner", "admin", "reviewer"))],
)
async def update_shortlist_entry(
    entry_id: UUID,
    data: ShortlistUpdate,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Update notes on a shortlisted profile."""
    entry = (
        db.query(TalentShortlist)
        .filter(
            TalentShortlist.id == entry_id,
            TalentShortlist.organization_id == org.id,
        )
        .first()
    )

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Shortlist entry not found"},
        )

    entry.notes = data.notes
    db.commit()
    db.refresh(entry)

    profile = (
        db.query(CandidateProfile)
        .filter(
            CandidateProfile.id == entry.profile_id,
        )
        .first()
    )

    profile_response = None
    if profile:
        profile_response = ProfilePublicResponse(
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
        )

    return {
        "success": True,
        "data": ShortlistResponse(
            id=entry.id,
            organization_id=entry.organization_id,
            profile_id=entry.profile_id,
            added_by=entry.added_by,
            notes=entry.notes,
            created_at=entry.created_at,
            profile=profile_response,
        ),
    }


@router.delete(
    "/shortlist/{entry_id}",
    response_model=APIResponse[dict],
    summary="Remove from shortlist",
    dependencies=[Depends(require_role("owner", "admin", "reviewer"))],
)
async def remove_from_shortlist(
    entry_id: UUID,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Remove a profile from the organization's shortlist."""
    entry = (
        db.query(TalentShortlist)
        .filter(
            TalentShortlist.id == entry_id,
            TalentShortlist.organization_id == org.id,
        )
        .first()
    )

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Shortlist entry not found"},
        )

    db.delete(entry)
    db.commit()

    return {"success": True, "data": {"message": "Removed from shortlist"}}


# =============================================================================
# Export
# =============================================================================


@router.get(
    "/shortlist/export",
    summary="Export shortlist to CSV",
    dependencies=[Depends(require_role("owner", "admin"))],
)
async def export_shortlist(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Export the organization's shortlist to CSV."""
    import csv
    import io

    try:
        shortlist_entries = (
            db.query(TalentShortlist)
            .filter(TalentShortlist.organization_id == org.id)
            .order_by(TalentShortlist.created_at.desc())
            .all()
        )
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"Failed to fetch shortlist for export: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DATABASE_ERROR", "message": "Failed to export shortlist"},
        )

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(
        [
            "Name",
            "Profile URL",
            "GitHub",
            "LinkedIn",
            "Vibe Score",
            "Skills",
            "Notes",
            "Added At",
        ]
    )

    # Data rows
    for entry in shortlist_entries:
        profile = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.id == entry.profile_id,
            )
            .first()
        )

        if profile:
            profile_url = f"/u/{profile.slug}" if profile.slug else f"/u/{profile.id}"
            writer.writerow(
                [
                    profile.name or "",
                    profile_url,
                    profile.github_url or "",
                    profile.linkedin_url or "",
                    str(profile.vibe_score),
                    ", ".join(profile.skills or []),
                    entry.notes or "",
                    entry.created_at.isoformat(),
                ]
            )

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=shortlist-{org.slug}.csv"
        },
    )
