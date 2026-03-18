"""
Activity logging service.

Logs significant events to the activity_log table for notifications and history.
"""

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.logs import ActivityLog


# Activity types
class ActivityType:
    """Activity type constants."""

    # Auth
    USER_JOINED = "user_joined"

    # Profile
    PROFILE_UPDATED = "profile_updated"
    PROFILE_COMPLETED = "profile_completed"
    RESUME_UPLOADED = "resume_uploaded"

    # Submissions
    SUBMISSION_CREATED = "submission_created"
    SUBMISSION_SCORED = "submission_scored"
    SUBMISSION_FAILED = "submission_failed"

    # Assessments
    ASSESSMENT_CREATED = "assessment_created"
    ASSESSMENT_PUBLISHED = "assessment_published"
    ASSESSMENT_ARCHIVED = "assessment_archived"

    # Membership
    MEMBER_JOINED = "member_joined"
    MEMBER_REMOVED = "member_removed"
    MEMBER_ROLE_CHANGED = "member_role_changed"

    # Admin
    INVITE_SENT = "invite_sent"
    INVITE_ACCEPTED = "invite_accepted"


def log_activity(
    db: Session,
    organization_id: UUID,
    activity_type: str,
    message: str,
    actor_id: UUID | None = None,
    target_type: str | None = None,
    target_id: UUID | None = None,
    event_data: dict[str, Any] | None = None,
) -> ActivityLog:
    """
    Log an activity event.

    Args:
        db: Database session
        organization_id: Organization scope
        activity_type: Type of activity (use ActivityType constants)
        message: Human-readable description
        actor_id: User who performed the action (optional for system events)
        target_type: Type of target entity (e.g., "submission", "assessment")
        target_id: ID of target entity
        event_data: Additional event data as JSON

    Returns:
        Created ActivityLog record
    """
    activity = ActivityLog(
        organization_id=organization_id,
        type=activity_type,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        message=message,
        event_data=event_data,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def log_submission_created(
    db: Session,
    organization_id: UUID,
    user_id: UUID,
    submission_id: UUID,
    assessment_name: str,
) -> ActivityLog:
    """Log a submission created event."""
    return log_activity(
        db=db,
        organization_id=organization_id,
        activity_type=ActivityType.SUBMISSION_CREATED,
        message=f"Submitted solution for {assessment_name}",
        actor_id=user_id,
        target_type="submission",
        target_id=submission_id,
    )


def log_submission_scored(
    db: Session,
    organization_id: UUID,
    user_id: UUID,
    submission_id: UUID,
    score: float,
) -> ActivityLog:
    """Log a submission scored event."""
    return log_activity(
        db=db,
        organization_id=organization_id,
        activity_type=ActivityType.SUBMISSION_SCORED,
        message=f"Submission scored: {score:.1f}%",
        actor_id=user_id,
        target_type="submission",
        target_id=submission_id,
        event_data={"score": score},
    )


def log_member_joined(
    db: Session,
    organization_id: UUID,
    user_id: UUID,
    role: str,
    invited_by: UUID | None = None,
) -> ActivityLog:
    """Log a member joined event."""
    message = f"Joined as {role}"
    if invited_by:
        message = f"Joined as {role} via invite"

    return log_activity(
        db=db,
        organization_id=organization_id,
        activity_type=ActivityType.MEMBER_JOINED,
        message=message,
        actor_id=user_id,
        target_type="user",
        target_id=user_id,
        event_data={
            "role": role,
            "invited_by": str(invited_by) if invited_by else None,
        },
    )


def log_profile_updated(
    db: Session,
    organization_id: UUID,
    user_id: UUID,
    fields_updated: list[str],
) -> ActivityLog:
    """Log a profile updated event."""
    return log_activity(
        db=db,
        organization_id=organization_id,
        activity_type=ActivityType.PROFILE_UPDATED,
        message=f"Updated profile fields: {', '.join(fields_updated)}",
        actor_id=user_id,
        target_type="profile",
        target_id=user_id,
        event_data={"fields": fields_updated},
    )


def get_recent_activities(
    db: Session,
    organization_id: UUID,
    limit: int = 50,
    actor_id: UUID | None = None,
    activity_type: str | None = None,
) -> list[ActivityLog]:
    """
    Get recent activities for an organization.

    Args:
        db: Database session
        organization_id: Organization scope
        limit: Max number of activities to return
        actor_id: Filter by actor (optional)
        activity_type: Filter by type (optional)

    Returns:
        List of ActivityLog records, most recent first
    """
    query = db.query(ActivityLog).filter(ActivityLog.organization_id == organization_id)

    if actor_id:
        query = query.filter(ActivityLog.actor_id == actor_id)

    if activity_type:
        query = query.filter(ActivityLog.type == activity_type)

    return query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
