"""
Points service for gamification.

Awards points for various events (profile completion, submissions, etc.).
Idempotent - prevents duplicate awards via unique constraint.
"""

from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.logs import PointsLog

# Point values from architecture-decisions.md - keep in sync!
POINT_EVENTS = {
    # Profile completion
    "profile_complete": 100,
    "github_verified": 50,
    "resume_uploaded": 25,
    # Submissions
    "first_submission": 200,
    "submission_score_70plus": 100,
    "submission_score_90plus": 200,
    # Consistency bonus
    "consecutive_week_submission": 50,
}


def award_points(
    db: Session,
    user_id: UUID,
    organization_id: UUID,
    event: str,
    event_data: dict[str, Any] | None = None,
) -> int:
    """
    Award points for an event (idempotent).

    The unique constraint (organization_id, user_id, event) prevents duplicate awards.

    Args:
        db: Database session
        user_id: User to award points to
        organization_id: Organization scope
        event: Event type (use POINT_EVENTS keys)
        event_data: Additional event data

    Returns:
        Points awarded (0 if already awarded or unknown event)
    """
    if event not in POINT_EVENTS:
        return 0

    points = POINT_EVENTS[event]

    try:
        log = PointsLog(
            organization_id=organization_id,
            user_id=user_id,
            event=event,
            points=points,
            event_data=event_data,
        )
        db.add(log)
        db.flush()  # Get the ID if needed

        # Update profile total points
        from app.models.candidate_profile import CandidateProfile

        profile = (
            db.query(CandidateProfile)
            .filter(
                CandidateProfile.organization_id == organization_id,
                CandidateProfile.user_id == user_id,
            )
            .first()
        )

        if profile:
            profile.total_points += points

        db.commit()
        return points

    except IntegrityError:
        # Already awarded (unique constraint violation)
        db.rollback()
        return 0


def award_submission_points(
    db: Session,
    user_id: UUID,
    organization_id: UUID,
    score: float,
    is_first_submission: bool = False,
) -> int:
    """
    Award points based on submission score.

    Args:
        db: Database session
        user_id: User who submitted
        organization_id: Organization scope
        score: Final submission score (0-100)
        is_first_submission: Whether this is the user's first submission

    Returns:
        Total points awarded
    """
    total_awarded = 0

    # First submission bonus
    if is_first_submission:
        total_awarded += award_points(
            db=db,
            user_id=user_id,
            organization_id=organization_id,
            event="first_submission",
        )

    # Score-based bonuses
    if score >= 90:
        total_awarded += award_points(
            db=db,
            user_id=user_id,
            organization_id=organization_id,
            event="submission_score_90plus",
            event_data={"score": score},
        )
    elif score >= 70:
        total_awarded += award_points(
            db=db,
            user_id=user_id,
            organization_id=organization_id,
            event="submission_score_70plus",
            event_data={"score": score},
        )

    return total_awarded


def get_user_points(
    db: Session,
    user_id: UUID,
    organization_id: UUID,
) -> dict[str, Any]:
    """
    Get user's point history and total.

    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization scope

    Returns:
        Dict with total points and event breakdown
    """
    logs = (
        db.query(PointsLog)
        .filter(
            PointsLog.organization_id == organization_id,
            PointsLog.user_id == user_id,
        )
        .order_by(PointsLog.created_at.desc())
        .all()
    )

    total = sum(log.points for log in logs)
    events = [
        {
            "event": log.event,
            "points": log.points,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

    return {
        "total": total,
        "events": events,
    }
