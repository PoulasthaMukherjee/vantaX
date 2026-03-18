"""
Leaderboard API endpoint.

Provides ranked candidates by score per SPRINT-PLAN.md.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_org, get_db
from app.models.enums import SubmissionStatus
from app.models.submission import Submission
from app.models.user import User

router = APIRouter()


@router.get("/leaderboard")
async def get_leaderboard(
    assessment_id: Optional[UUID] = Query(None, description="Filter by assessment"),
    limit: int = Query(default=50, le=100, description="Max results to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    org=Depends(get_current_org),
):
    """
    Get ranked candidates by score.

    Org-scoped - only shows candidates from the current organization.
    Only includes EVALUATED submissions.

    Args:
        assessment_id: Optional filter by specific assessment
        limit: Max number of results (default 50, max 100)
        offset: Pagination offset

    Returns:
        Ranked list of candidates with scores
    """
    # Base query - join with users for name/email
    query = (
        db.query(
            Submission.candidate_id,
            User.name,
            User.email,
            Submission.final_score,
            Submission.evaluated_at,
            Submission.assessment_id,
        )
        .join(User, User.id == Submission.candidate_id)
        .filter(
            Submission.organization_id == org.id,
            Submission.status == SubmissionStatus.EVALUATED,
            Submission.final_score.isnot(None),
        )
    )

    # Optional assessment filter
    if assessment_id:
        query = query.filter(Submission.assessment_id == assessment_id)

    # Get total count before pagination
    total_count = query.count()

    # Order by score descending, then by evaluation date (earlier is better for ties)
    results = (
        query.order_by(
            Submission.final_score.desc(),
            Submission.evaluated_at.asc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Build leaderboard with ranks
    leaderboard = []
    for idx, r in enumerate(results):
        leaderboard.append(
            {
                "rank": offset + idx + 1,
                "candidate_id": str(r.candidate_id),
                "name": r.name or "Anonymous",
                "email": _mask_email(r.email) if r.email else None,
                "score": float(r.final_score),
                "evaluated_at": r.evaluated_at.isoformat() if r.evaluated_at else None,
                "assessment_id": str(r.assessment_id),
            }
        )

    return {
        "success": True,
        "data": leaderboard,
        "meta": {
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(results) < total_count,
        },
    }


@router.get("/leaderboard/stats")
async def get_leaderboard_stats(
    assessment_id: Optional[UUID] = Query(None, description="Filter by assessment"),
    db: Session = Depends(get_db),
    org=Depends(get_current_org),
):
    """
    Get leaderboard statistics.

    Returns aggregate stats for the leaderboard.
    """
    query = db.query(Submission).filter(
        Submission.organization_id == org.id,
        Submission.status == SubmissionStatus.EVALUATED,
        Submission.final_score.isnot(None),
    )

    if assessment_id:
        query = query.filter(Submission.assessment_id == assessment_id)

    stats = db.query(
        func.count(Submission.id).label("total_submissions"),
        func.avg(Submission.final_score).label("avg_score"),
        func.max(Submission.final_score).label("max_score"),
        func.min(Submission.final_score).label("min_score"),
    ).filter(
        Submission.organization_id == org.id,
        Submission.status == SubmissionStatus.EVALUATED,
        Submission.final_score.isnot(None),
    )

    if assessment_id:
        stats = stats.filter(Submission.assessment_id == assessment_id)

    result = stats.first()

    return {
        "success": True,
        "data": {
            "total_submissions": result.total_submissions or 0,
            "avg_score": float(result.avg_score) if result.avg_score else None,
            "max_score": float(result.max_score) if result.max_score else None,
            "min_score": float(result.min_score) if result.min_score else None,
        },
    }


def _mask_email(email: str) -> str:
    """
    Mask email for privacy in leaderboard.

    Example: john.doe@example.com -> j***@example.com
    """
    if not email or "@" not in email:
        return email

    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"{local}***@{domain}"
    return f"{local[0]}***@{domain}"
