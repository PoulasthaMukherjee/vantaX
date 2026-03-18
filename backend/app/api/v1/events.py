"""
Event (hackathon) API endpoints.

Provides CRUD for events, registration management, and event leaderboards.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_org,
    get_current_user,
    get_db,
    require_not_maintenance,
    require_role,
)
from app.models.assessment import Assessment
from app.models.enums import EventStatus, EventVisibility, SubmissionStatus
from app.models.event import Event, EventAssessment, EventInvite, EventRegistration
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.models.submission import Submission
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.event import (
    CertificateResponse,
    EventAssessmentCreate,
    EventAssessmentResponse,
    EventCreate,
    EventInviteBulkCreate,
    EventInviteCreate,
    EventInviteResponse,
    EventLeaderboardEntry,
    EventLeaderboardResponse,
    EventListResponse,
    EventRegistrationResponse,
    EventResponse,
    EventUpdate,
)

router = APIRouter()


# =============================================================================
# Event CRUD
# =============================================================================


@router.get(
    "",
    response_model=APIResponse[list[EventListResponse]],
    summary="List events",
)
async def list_events(
    status_filter: str | None = Query(None, alias="status"),
    visibility_filter: str | None = Query(None, alias="visibility"),
    tag: str | None = None,
    include_past: bool = False,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List events for the current organization.

    By default, only shows upcoming and active events.
    Use include_past=true to include ended events.
    """
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )
    is_staff = membership is not None and membership.role in (
        "owner",
        "admin",
        "reviewer",
    )

    if status_filter == EventStatus.DRAFT.value and not is_staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INSUFFICIENT_ROLE",
                "message": "This action requires one of: owner, admin, reviewer",
            },
        )

    query = db.query(Event).filter(Event.organization_id == org.id)

    if status_filter:
        query = query.filter(Event.status == status_filter)
    elif not include_past:
        # Use string values directly since the database stores lowercase enum values
        query = query.filter(
            Event.status.in_(["upcoming", "active"])
        )

    if visibility_filter:
        query = query.filter(Event.visibility == visibility_filter)

    if tag:
        query = query.filter(Event.tags.contains([tag]))

    # Hide drafts/private from non-staff; hide invite_only from list for candidates.
    if not is_staff:
        query = query.filter(Event.status != "draft")
        query = query.filter(Event.visibility != "private")

    events = query.order_by(Event.starts_at.desc()).offset(offset).limit(limit).all()

    # Add participant counts
    result = []
    for event in events:
        event_dict = EventListResponse.model_validate(event).model_dump()
        event_dict["participant_count"] = (
            db.query(func.count(EventRegistration.id))
            .filter(EventRegistration.event_id == event.id)
            .scalar()
        )
        result.append(event_dict)

    return {"success": True, "data": result}


@router.get(
    "/{event_id_or_slug}",
    response_model=APIResponse[EventResponse],
    summary="Get event details",
)
async def get_event(
    event_id_or_slug: str,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get event details by ID."""
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )
    is_staff = membership is not None and membership.role in (
        "owner",
        "admin",
        "reviewer",
    )

    query = db.query(Event).filter(Event.organization_id == org.id)
    try:
        event_id = UUID(event_id_or_slug)
        query = query.filter(Event.id == event_id)
    except ValueError:
        query = query.filter(Event.slug == event_id_or_slug)

    event = query.first()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    if not is_staff and (
        event.status == EventStatus.DRAFT or event.visibility == EventVisibility.PRIVATE
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    response = EventResponse.model_validate(event).model_dump()

    # Add computed fields
    response["participant_count"] = (
        db.query(func.count(EventRegistration.id))
        .filter(EventRegistration.event_id == event.id)
        .scalar()
    )
    response["assessment_count"] = (
        db.query(func.count(EventAssessment.id))
        .filter(EventAssessment.event_id == event.id)
        .scalar()
    )
    response["is_registered"] = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event.id,
            EventRegistration.user_id == user.id,
        )
        .first()
        is not None
    )

    return {"success": True, "data": response}


@router.post(
    "",
    response_model=APIResponse[EventResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create event",
    dependencies=[Depends(require_not_maintenance)],
)
async def create_event(
    data: EventCreate,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new event (hackathon).

    Only admins and owners can create events.
    """
    # Check slug uniqueness
    existing = (
        db.query(Event)
        .filter(
            Event.organization_id == org.id,
            Event.slug == data.slug,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "SLUG_EXISTS",
                "message": "An event with this slug already exists",
            },
        )

    # Create event
    event = Event(
        organization_id=org.id,
        created_by=user.id,
        title=data.title,
        slug=data.slug,
        description=data.description,
        short_description=data.short_description,
        banner_url=data.banner_url,
        logo_url=data.logo_url,
        theme_color=data.theme_color,
        status=EventStatus.DRAFT,
        visibility=data.visibility,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        registration_opens_at=data.registration_opens_at,
        registration_closes_at=data.registration_closes_at,
        max_participants=data.max_participants,
        max_submissions_per_user=data.max_submissions_per_user,
        rules=data.rules,
        prizes=data.prizes,
        sponsors=[s.model_dump() for s in data.sponsors] if data.sponsors else None,
        certificates_enabled=data.certificates_enabled,
        certificate_template=data.certificate_template,
        min_score_for_certificate=data.min_score_for_certificate,
        tags=data.tags,
    )
    db.add(event)
    db.flush()

    # Link assessments if provided
    if data.assessment_ids:
        for i, assessment_id in enumerate(data.assessment_ids):
            # Verify assessment exists and belongs to org
            assessment = (
                db.query(Assessment)
                .filter(
                    Assessment.id == assessment_id,
                    Assessment.organization_id == org.id,
                )
                .first()
            )
            if assessment:
                link = EventAssessment(
                    event_id=event.id,
                    assessment_id=assessment_id,
                    display_order=i,
                )
                db.add(link)

    db.commit()
    db.refresh(event)

    return {"success": True, "data": EventResponse.model_validate(event)}


@router.patch(
    "/{event_id}",
    response_model=APIResponse[EventResponse],
    summary="Update event",
    dependencies=[Depends(require_not_maintenance)],
)
async def update_event(
    event_id: UUID,
    data: EventUpdate,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Update an event. Only admins and owners can update events."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    # Check slug uniqueness if changing
    if data.slug and data.slug != event.slug:
        existing = (
            db.query(Event)
            .filter(
                Event.organization_id == org.id,
                Event.slug == data.slug,
                Event.id != event_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SLUG_EXISTS",
                    "message": "An event with this slug already exists",
                },
            )

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "sponsors" and value is not None:
            value = [s if isinstance(s, dict) else s.model_dump() for s in value]
        setattr(event, field, value)

    db.commit()
    db.refresh(event)

    return {"success": True, "data": EventResponse.model_validate(event)}


@router.delete(
    "/{event_id}",
    response_model=APIResponse[None],
    summary="Delete event",
    dependencies=[Depends(require_not_maintenance)],
)
async def delete_event(
    event_id: UUID,
    membership=Depends(require_role("owner")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Delete an event. Only owners can delete events."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    # Don't allow deleting active events with submissions
    if event.status == EventStatus.ACTIVE:
        submission_count = (
            db.query(func.count(Submission.id))
            .filter(Submission.event_id == event_id)
            .scalar()
        )
        if submission_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EVENT_HAS_SUBMISSIONS",
                    "message": "Cannot delete an active event with submissions",
                },
            )

    db.delete(event)
    db.commit()

    return {"success": True, "data": None}


# =============================================================================
# Event Registration
# =============================================================================


@router.post(
    "/{event_id}/register",
    response_model=APIResponse[EventRegistrationResponse],
    summary="Register for event",
    dependencies=[Depends(require_not_maintenance)],
)
async def register_for_event(
    event_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register the current user for an event."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    # Check if registration is open
    if not event.is_registration_open:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "REGISTRATION_CLOSED",
                "message": "Registration is not open for this event",
            },
        )

    # Check if already registered
    existing = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event_id,
            EventRegistration.user_id == user.id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_REGISTERED",
                "message": "You are already registered for this event",
            },
        )

    # Check invite_only visibility - require valid invite
    invite = None
    if event.visibility == EventVisibility.INVITE_ONLY:
        invite = (
            db.query(EventInvite)
            .filter(
                EventInvite.event_id == event_id,
                EventInvite.email == (user.email or "").lower(),
                EventInvite.revoked_at.is_(None),
            )
            .first()
        )

        if not invite:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INVITE_REQUIRED",
                    "message": "This event requires an invitation to register",
                },
            )

    # Check participant cap
    if event.max_participants:
        current_count = (
            db.query(func.count(EventRegistration.id))
            .filter(EventRegistration.event_id == event_id)
            .scalar()
        )
        if current_count >= event.max_participants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EVENT_FULL",
                    "message": "This event has reached maximum capacity",
                },
            )

    # Create registration
    registration = EventRegistration(
        event_id=event_id,
        user_id=user.id,
        registered_at=datetime.utcnow(),
    )
    db.add(registration)

    # Mark invite as accepted if this was an invite_only event
    if invite:
        invite.accepted_at = datetime.utcnow()
        if not invite.user_id:
            invite.user_id = user.id

    db.commit()
    db.refresh(registration)

    return {
        "success": True,
        "data": EventRegistrationResponse.model_validate(registration),
    }


@router.delete(
    "/{event_id}/register",
    response_model=APIResponse[None],
    summary="Unregister from event",
)
async def unregister_from_event(
    event_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unregister the current user from an event."""
    registration = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event_id,
            EventRegistration.user_id == user.id,
        )
        .first()
    )

    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_REGISTERED",
                "message": "You are not registered for this event",
            },
        )

    # Check if event has started and user has submissions
    event = db.query(Event).filter(Event.id == event_id).first()
    if event and event.status == EventStatus.ACTIVE:
        submission_count = (
            db.query(func.count(Submission.id))
            .filter(
                Submission.event_id == event_id,
                Submission.candidate_id == user.id,
            )
            .scalar()
        )
        if submission_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "HAS_SUBMISSIONS",
                    "message": "Cannot unregister after making submissions",
                },
            )

    db.delete(registration)
    db.commit()

    return {"success": True, "data": None}


@router.get(
    "/{event_id}/registrations",
    response_model=APIResponse[list[EventRegistrationResponse]],
    summary="List event registrations",
)
async def list_event_registrations(
    event_id: UUID,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    membership=Depends(require_role("owner", "admin", "reviewer")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """List registrations for an event. Admin/reviewer access only."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    registrations = (
        db.query(EventRegistration)
        .filter(EventRegistration.event_id == event_id)
        .order_by(EventRegistration.registered_at)
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "data": [EventRegistrationResponse.model_validate(r) for r in registrations],
    }


# =============================================================================
# Event Assessments
# =============================================================================


@router.get(
    "/{event_id}/assessments",
    response_model=APIResponse[list[EventAssessmentResponse]],
    summary="List event assessments",
)
async def list_event_assessments(
    event_id: UUID,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """List assessments linked to an event."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    links = (
        db.query(EventAssessment)
        .filter(EventAssessment.event_id == event_id)
        .order_by(EventAssessment.display_order)
        .all()
    )

    result = []
    for link in links:
        assessment = (
            db.query(Assessment).filter(Assessment.id == link.assessment_id).first()
        )
        link_data = EventAssessmentResponse.model_validate(link).model_dump()
        link_data["assessment_title"] = assessment.title if assessment else None
        result.append(link_data)

    return {"success": True, "data": result}


@router.post(
    "/{event_id}/assessments",
    response_model=APIResponse[EventAssessmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add assessment to event",
    dependencies=[Depends(require_not_maintenance)],
)
async def add_event_assessment(
    event_id: UUID,
    data: EventAssessmentCreate,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Link an assessment to an event."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    # Verify assessment exists
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == data.assessment_id,
            Assessment.organization_id == org.id,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSESSMENT_NOT_FOUND", "message": "Assessment not found"},
        )

    # Check if already linked
    existing = (
        db.query(EventAssessment)
        .filter(
            EventAssessment.event_id == event_id,
            EventAssessment.assessment_id == data.assessment_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_LINKED",
                "message": "Assessment is already linked to this event",
            },
        )

    link = EventAssessment(
        event_id=event_id,
        assessment_id=data.assessment_id,
        display_order=data.display_order,
        points_multiplier=data.points_multiplier,
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    response = EventAssessmentResponse.model_validate(link).model_dump()
    response["assessment_title"] = assessment.title

    return {"success": True, "data": response}


@router.delete(
    "/{event_id}/assessments/{assessment_id}",
    response_model=APIResponse[None],
    summary="Remove assessment from event",
    dependencies=[Depends(require_not_maintenance)],
)
async def remove_event_assessment(
    event_id: UUID,
    assessment_id: UUID,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Remove an assessment link from an event."""
    link = (
        db.query(EventAssessment)
        .filter(
            EventAssessment.event_id == event_id,
            EventAssessment.assessment_id == assessment_id,
        )
        .first()
    )

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "LINK_NOT_FOUND",
                "message": "Assessment is not linked to this event",
            },
        )

    db.delete(link)
    db.commit()

    return {"success": True, "data": None}


# =============================================================================
# Event Leaderboard
# =============================================================================


@router.get(
    "/{event_id}/leaderboard",
    response_model=APIResponse[EventLeaderboardResponse],
    summary="Get event leaderboard",
)
async def get_event_leaderboard(
    event_id: UUID,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    Get the leaderboard for an event.

    Scores are calculated as: SUM(submission.final_score * event_assessment.points_multiplier)
    across all evaluated submissions for each user in the event.
    """
    from sqlalchemy import desc

    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    # Calculate weighted scores: SUM(final_score * points_multiplier) per user
    # Join submissions with event_assessments to get the multiplier
    weighted_scores = (
        db.query(
            Submission.candidate_id,
            func.sum(Submission.final_score * EventAssessment.points_multiplier).label(
                "weighted_score"
            ),
            func.count(Submission.id).label("submission_count"),
            func.max(Submission.evaluated_at).label("last_evaluated"),
        )
        .join(
            EventAssessment,
            (EventAssessment.event_id == Submission.event_id)
            & (EventAssessment.assessment_id == Submission.assessment_id),
        )
        .filter(
            Submission.event_id == event_id,
            Submission.status == SubmissionStatus.EVALUATED,
            Submission.final_score.isnot(None),
        )
        .group_by(Submission.candidate_id)
        .subquery()
    )

    # Join with users to get names and order by weighted score
    results = (
        db.query(
            weighted_scores.c.candidate_id,
            weighted_scores.c.weighted_score,
            weighted_scores.c.submission_count,
            weighted_scores.c.last_evaluated,
            User.name,
        )
        .join(User, User.id == weighted_scores.c.candidate_id)
        .order_by(desc(weighted_scores.c.weighted_score))
        .offset(offset)
        .limit(limit)
        .all()
    )

    entries = []
    for rank, (candidate_id, score, sub_count, last_eval, name) in enumerate(
        results, start=offset + 1
    ):
        # Get the best single submission for this user (highest weighted contribution)
        best_sub = (
            db.query(Submission)
            .join(
                EventAssessment,
                (EventAssessment.event_id == Submission.event_id)
                & (EventAssessment.assessment_id == Submission.assessment_id),
            )
            .filter(
                Submission.event_id == event_id,
                Submission.candidate_id == candidate_id,
                Submission.status == SubmissionStatus.EVALUATED,
            )
            .order_by(desc(Submission.final_score * EventAssessment.points_multiplier))
            .first()
        )

        entries.append(
            EventLeaderboardEntry(
                rank=rank,
                user_id=candidate_id,
                user_name=name,
                total_score=float(score) if score else 0,
                submission_count=sub_count,
                best_submission_id=best_sub.id if best_sub else None,
                evaluated_at=last_eval,
            )
        )

    total_participants = (
        db.query(func.count(EventRegistration.id))
        .filter(EventRegistration.event_id == event_id)
        .scalar()
    )

    return {
        "success": True,
        "data": EventLeaderboardResponse(
            event_id=event_id,
            event_title=event.title,
            total_participants=total_participants,
            entries=entries,
        ),
    }


# =============================================================================
# Certificates
# =============================================================================


@router.post(
    "/{event_id}/certificate",
    response_model=APIResponse[CertificateResponse],
    summary="Generate certificate",
)
async def generate_certificate(
    event_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a certificate for the current user's participation in an event."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    if not event.certificates_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CERTIFICATES_DISABLED",
                "message": "Certificates are not enabled for this event",
            },
        )

    if not event.has_ended:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EVENT_NOT_ENDED",
                "message": "Certificates can only be generated after the event ends",
            },
        )

    # Check registration
    registration = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event_id,
            EventRegistration.user_id == user.id,
        )
        .first()
    )

    if not registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NOT_REGISTERED",
                "message": "You must be registered for the event to get a certificate",
            },
        )

    # Check minimum score requirement
    best_submission = (
        db.query(Submission)
        .filter(
            Submission.event_id == event_id,
            Submission.candidate_id == user.id,
            Submission.status == SubmissionStatus.EVALUATED,
        )
        .order_by(Submission.final_score.desc())
        .first()
    )

    if not best_submission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NO_SUBMISSIONS",
                "message": "You must have at least one evaluated submission",
            },
        )

    min_score = event.min_score_for_certificate or 0
    if (best_submission.final_score or 0) < min_score:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SCORE_TOO_LOW",
                "message": f"Minimum score of {event.min_score_for_certificate} required for certificate",
            },
        )

    # Check if certificate already issued
    if registration.certificate_issued and registration.certificate_url:
        from app.services.resume import get_storage_backend

        storage = get_storage_backend()
        if not storage.exists(registration.certificate_url):
            registration.certificate_issued = False
            registration.certificate_issued_at = None
            registration.certificate_url = None
            db.commit()
        else:
            filename = (
                f"{event.slug}-certificate.pdf"
                if getattr(event, "slug", None)
                else "certificate.pdf"
            )
            access_url = (
                storage.get_url(registration.certificate_url, filename=filename)
                or registration.certificate_url
            )

            return {
                "success": True,
                "data": CertificateResponse(
                    certificate_url=access_url,
                    issued_at=registration.certificate_issued_at or datetime.utcnow(),
                ),
            }

    # Generate and store certificate PDF
    from app.services.certificates import generate_certificate_pdf
    from app.services.resume import get_storage_backend

    issued_at = datetime.utcnow()
    recipient_name = user.name or user.email
    score_value = float(best_submission.final_score or 0)

    pdf_bytes = generate_certificate_pdf(
        title="Certificate of Participation",
        recipient_name=recipient_name,
        event_title=event.title,
        score=score_value,
        issued_at=issued_at,
    )

    storage = get_storage_backend()
    certificate_path = f"certificates/{event_id}/{user.id}.pdf"
    saved = await storage.save(
        certificate_path,
        pdf_bytes,
        content_type="application/pdf",
    )

    if not saved:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CERTIFICATE_SAVE_FAILED",
                "message": "Failed to generate certificate",
            },
        )

    # Store the storage path; API will return an access URL (signed for GCS).
    certificate_url = certificate_path

    registration.certificate_issued = True
    registration.certificate_issued_at = issued_at
    registration.certificate_url = certificate_url
    db.commit()

    filename = (
        f"{event.slug}-certificate.pdf"
        if getattr(event, "slug", None)
        else "certificate.pdf"
    )
    access_url = (
        storage.get_url(certificate_path, filename=filename) or certificate_path
    )

    return {
        "success": True,
        "data": CertificateResponse(
            certificate_url=access_url,
            issued_at=registration.certificate_issued_at,
        ),
    }


# =============================================================================
# Event Invites (for invite_only events)
# =============================================================================


@router.get(
    "/{event_id}/invites",
    response_model=APIResponse[list[EventInviteResponse]],
    summary="List event invites",
    dependencies=[Depends(require_role("owner", "admin"))],
)
async def list_event_invites(
    event_id: UUID,
    include_revoked: bool = False,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """List invites for an event. Admin only."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    query = db.query(EventInvite).filter(EventInvite.event_id == event_id)

    if not include_revoked:
        query = query.filter(EventInvite.revoked_at.is_(None))

    invites = (
        query.order_by(EventInvite.invited_at.desc()).offset(offset).limit(limit).all()
    )

    # Build response with user/inviter names
    response_invites = []
    for invite in invites:
        inviter = db.query(User).filter(User.id == invite.invited_by).first()
        invited_user = (
            db.query(User).filter(User.id == invite.user_id).first()
            if invite.user_id
            else None
        )

        response_invites.append(
            EventInviteResponse(
                id=invite.id,
                event_id=invite.event_id,
                email=invite.email,
                user_id=invite.user_id,
                invited_by=invite.invited_by,
                invited_at=invite.invited_at,
                accepted_at=invite.accepted_at,
                revoked_at=invite.revoked_at,
                inviter_name=inviter.name if inviter else None,
                user_name=invited_user.name if invited_user else None,
            )
        )

    return {"success": True, "data": response_invites}


@router.post(
    "/{event_id}/invites",
    response_model=APIResponse[EventInviteResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create event invite",
    dependencies=[Depends(require_role("owner", "admin"))],
)
async def create_event_invite(
    event_id: UUID,
    data: EventInviteCreate,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an invite for an event. Admin only."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    email = data.email.strip().lower()

    existing = (
        db.query(EventInvite)
        .filter(
            EventInvite.event_id == event_id,
            EventInvite.email == email,
        )
        .first()
    )

    if existing and existing.revoked_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVITE_EXISTS",
                "message": "An invite already exists for this email",
            },
        )

    # Check if user with this email exists
    target_user = db.query(User).filter(User.email == email).first()

    if existing and existing.revoked_at is not None:
        existing.revoked_at = None
        existing.accepted_at = None
        existing.invited_at = datetime.utcnow()
        existing.invited_by = user.id
        if target_user and not existing.user_id:
            existing.user_id = target_user.id
        db.commit()
        db.refresh(existing)
        invite = existing
    else:
        invite = EventInvite(
            event_id=event_id,
            email=email,
            user_id=target_user.id if target_user else None,
            invited_by=user.id,
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)

    return {
        "success": True,
        "data": EventInviteResponse(
            id=invite.id,
            event_id=invite.event_id,
            email=invite.email,
            user_id=invite.user_id,
            invited_by=invite.invited_by,
            invited_at=invite.invited_at,
            accepted_at=invite.accepted_at,
            revoked_at=invite.revoked_at,
            inviter_name=user.name,
            user_name=target_user.name if target_user else None,
        ),
    }


@router.post(
    "/{event_id}/invites/bulk",
    response_model=APIResponse[dict],
    status_code=status.HTTP_201_CREATED,
    summary="Create multiple event invites",
    dependencies=[Depends(require_role("owner", "admin"))],
)
async def create_event_invites_bulk(
    event_id: UUID,
    data: EventInviteBulkCreate,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create multiple invites for an event. Admin only."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    created = 0
    skipped = 0
    errors: list[str] = []

    seen_emails: set[str] = set()
    for email in data.emails:
        email_lower = email.lower().strip()
        if not email_lower:
            continue
        if email_lower in seen_emails:
            skipped += 1
            continue
        seen_emails.add(email_lower)

        existing = (
            db.query(EventInvite)
            .filter(
                EventInvite.event_id == event_id,
                EventInvite.email == email_lower,
            )
            .first()
        )

        if existing and existing.revoked_at is None:
            skipped += 1
            continue

        # Check if user exists
        target_user = db.query(User).filter(User.email == email_lower).first()

        if existing and existing.revoked_at is not None:
            existing.revoked_at = None
            existing.accepted_at = None
            existing.invited_at = datetime.utcnow()
            existing.invited_by = user.id
            if target_user and not existing.user_id:
                existing.user_id = target_user.id
            created += 1
        else:
            invite = EventInvite(
                event_id=event_id,
                email=email_lower,
                user_id=target_user.id if target_user else None,
                invited_by=user.id,
            )
            db.add(invite)
            created += 1

    db.commit()

    return {
        "success": True,
        "data": {
            "created": created,
            "skipped": skipped,
            "total": len(data.emails),
        },
    }


@router.delete(
    "/{event_id}/invites/{invite_id}",
    response_model=APIResponse[dict],
    summary="Revoke event invite",
    dependencies=[Depends(require_role("owner", "admin"))],
)
async def revoke_event_invite(
    event_id: UUID,
    invite_id: UUID,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Revoke an event invite. Admin only."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    invite = (
        db.query(EventInvite)
        .filter(
            EventInvite.id == invite_id,
            EventInvite.event_id == event_id,
        )
        .first()
    )

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVITE_NOT_FOUND", "message": "Invite not found"},
        )

    if invite.revoked_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_REVOKED", "message": "Invite is already revoked"},
        )

    invite.revoked_at = datetime.utcnow()
    db.commit()

    return {"success": True, "data": {"message": "Invite revoked"}}


@router.get(
    "/{event_id}/invites/check",
    response_model=APIResponse[dict],
    summary="Check if current user has invite",
)
async def check_event_invite(
    event_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if current user has a valid invite for this event."""
    event = (
        db.query(Event)
        .filter(
            Event.id == event_id,
            Event.organization_id == org.id,
        )
        .first()
    )

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
        )

    invite = (
        db.query(EventInvite)
        .filter(
            EventInvite.event_id == event_id,
            EventInvite.email == (user.email or "").lower(),
            EventInvite.revoked_at.is_(None),
        )
        .first()
    )

    return {
        "success": True,
        "data": {
            "has_invite": invite is not None,
            "invite_id": str(invite.id) if invite else None,
        },
    }
