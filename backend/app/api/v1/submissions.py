"""
Submissions API endpoints.

Handles submission creation, status tracking, and retrieval.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_org,
    get_current_user,
    get_db,
    require_not_maintenance,
    require_role,
)
from app.models.assessment import Assessment
from app.models.assessment_invite import AssessmentInvite
from app.models.enums import AssessmentStatus, AssessmentVisibility, SubmissionStatus
from app.models.event import Event, EventAssessment, EventRegistration
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.models.submission import Submission
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.submission import (
    SubmissionCreate,
    SubmissionDetailResponse,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionStatusResponse,
)
from app.services.activity import ActivityType, log_activity
from app.services.github import validate_github_url
from app.services.submission_files import save_submission_files, save_submission_zip

router = APIRouter()


# =============================================================================
# Common Validation Helpers
# =============================================================================


def _validate_submission_context(
    db: Session,
    org: Organization,
    user: User,
    assessment_id: UUID,
    event_id: UUID | None,
) -> tuple[Assessment, Event | None]:
    """
    Validate common submission requirements.

    Returns:
        Tuple of (assessment, event) if valid

    Raises:
        HTTPException on validation failure
    """
    # Check assessment exists and is accessible
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == assessment_id,
            Assessment.organization_id == org.id,
            Assessment.status == AssessmentStatus.PUBLISHED,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ASSESSMENT_NOT_FOUND",
                "message": "Assessment not found or not available",
            },
        )

    # Check invite-only access
    if assessment.visibility == AssessmentVisibility.INVITE_ONLY:
        invite = (
            db.query(AssessmentInvite)
            .filter(
                AssessmentInvite.assessment_id == assessment.id,
                AssessmentInvite.email.ilike(user.email),
            )
            .first()
        )

        if not invite:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INVITE_REQUIRED",
                    "message": "This assessment requires an invitation",
                },
            )

    # Validate event context if provided
    event = None
    if event_id:
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

        # Check event is active
        if not event.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EVENT_NOT_ACTIVE",
                    "message": "This event is not currently active",
                },
            )

        # Check event hasn't ended
        if event.has_ended:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EVENT_ENDED",
                    "message": "This event has already ended",
                },
            )

        # Check user is registered for the event
        registration = (
            db.query(EventRegistration)
            .filter(
                EventRegistration.event_id == event.id,
                EventRegistration.user_id == user.id,
            )
            .first()
        )

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NOT_REGISTERED",
                    "message": "You must register for this event first",
                },
            )

        # Check assessment is linked to the event
        event_assessment = (
            db.query(EventAssessment)
            .filter(
                EventAssessment.event_id == event.id,
                EventAssessment.assessment_id == assessment.id,
            )
            .first()
        )

        if not event_assessment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ASSESSMENT_NOT_IN_EVENT",
                    "message": "This assessment is not part of the event",
                },
            )

        # Check submission cap for this user in this event
        user_event_submissions = (
            db.query(Submission)
            .filter(
                Submission.event_id == event.id,
                Submission.candidate_id == user.id,
            )
            .count()
        )

        if user_event_submissions >= event.max_submissions_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "SUBMISSION_LIMIT_REACHED",
                    "message": f"You have reached the maximum of {event.max_submissions_per_user} submissions for this event",
                },
            )

    # Check one-attempt constraint
    existing = (
        db.query(Submission)
        .filter(
            Submission.organization_id == org.id,
            Submission.candidate_id == user.id,
            Submission.assessment_id == assessment.id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_SUBMITTED",
                "message": "You have already submitted to this assessment",
            },
        )

    return assessment, event


# =============================================================================
# Submission Endpoints
# =============================================================================


@router.post(
    "",
    response_model=APIResponse[SubmissionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create submission",
    dependencies=[Depends(require_not_maintenance)],
)
async def create_submission(
    data: SubmissionCreate,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new submission.

    Validates:
    - GitHub URL is valid and SSRF-safe
    - Assessment exists and is published
    - User hasn't already submitted to this assessment (one-attempt rule)
    - Rate limits (handled by middleware)

    Enqueues scoring job on success.
    """
    # 1. Validate GitHub URL (SSRF-safe)
    validation = validate_github_url(data.github_repo_url)
    if not validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_REPO_URL", "message": validation.error},
        )

    # 2. Check assessment exists and is accessible
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == data.assessment_id,
            Assessment.organization_id == org.id,
            Assessment.status == AssessmentStatus.PUBLISHED,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ASSESSMENT_NOT_FOUND",
                "message": "Assessment not found or not available",
            },
        )

    # 2.5. Check invite-only access
    if assessment.visibility == AssessmentVisibility.INVITE_ONLY:
        invite = (
            db.query(AssessmentInvite)
            .filter(
                AssessmentInvite.assessment_id == assessment.id,
                AssessmentInvite.email.ilike(user.email),
            )
            .first()
        )

        if not invite:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INVITE_REQUIRED",
                    "message": "This assessment requires an invitation",
                },
            )

    # 2.6. Validate event context if provided
    event = None
    if data.event_id:
        event = (
            db.query(Event)
            .filter(
                Event.id == data.event_id,
                Event.organization_id == org.id,
            )
            .first()
        )

        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "EVENT_NOT_FOUND", "message": "Event not found"},
            )

        # Check event is active
        if not event.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EVENT_NOT_ACTIVE",
                    "message": "This event is not currently active",
                },
            )

        # Check event hasn't ended
        if event.has_ended:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EVENT_ENDED",
                    "message": "This event has already ended",
                },
            )

        # Check user is registered for the event
        registration = (
            db.query(EventRegistration)
            .filter(
                EventRegistration.event_id == event.id,
                EventRegistration.user_id == user.id,
            )
            .first()
        )

        if not registration:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NOT_REGISTERED",
                    "message": "You must register for this event first",
                },
            )

        # Check assessment is linked to the event
        event_assessment = (
            db.query(EventAssessment)
            .filter(
                EventAssessment.event_id == event.id,
                EventAssessment.assessment_id == assessment.id,
            )
            .first()
        )

        if not event_assessment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ASSESSMENT_NOT_IN_EVENT",
                    "message": "This assessment is not part of the event",
                },
            )

        # Check submission cap for this user in this event
        user_event_submissions = (
            db.query(Submission)
            .filter(
                Submission.event_id == event.id,
                Submission.candidate_id == user.id,
            )
            .count()
        )

        if user_event_submissions >= event.max_submissions_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "SUBMISSION_LIMIT_REACHED",
                    "message": f"You have reached the maximum of {event.max_submissions_per_user} submissions for this event",
                },
            )

    # 3. Check one-attempt constraint
    existing = (
        db.query(Submission)
        .filter(
            Submission.organization_id == org.id,
            Submission.candidate_id == user.id,
            Submission.assessment_id == assessment.id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_SUBMITTED",
                "message": "You have already submitted to this assessment",
            },
        )

    # 4. Create submission
    submission = Submission(
        organization_id=org.id,
        candidate_id=user.id,
        assessment_id=assessment.id,
        event_id=data.event_id,  # Link to event if provided
        submission_type="github",
        github_repo_url=data.github_repo_url,
        explanation_text=data.explanation_text,
        status=SubmissionStatus.SUBMITTED,
        submitted_at=datetime.utcnow(),
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # 5. Enqueue scoring job
    try:
        from app.worker.queue import enqueue_scoring_job

        job_id = enqueue_scoring_job(
            submission_id=str(submission.id),
            organization_id=str(org.id),
        )
        submission.job_id = job_id
        submission.status = SubmissionStatus.QUEUED
        db.commit()
    except Exception as e:
        # Job enqueue failed, but submission created
        # Mark for manual retry
        submission.error_message = f"Failed to enqueue job: {str(e)}"
        db.commit()

    # 6. Log activity
    log_activity(
        db=db,
        organization_id=org.id,
        activity_type=ActivityType.SUBMISSION_CREATED,
        message=f"Submitted solution for {assessment.title}",
        actor_id=user.id,
        target_type="submission",
        target_id=submission.id,
    )

    return {
        "success": True,
        "data": SubmissionResponse.model_validate(submission),
    }


@router.post(
    "/upload",
    response_model=APIResponse[SubmissionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create submission via file upload",
    dependencies=[Depends(require_not_maintenance)],
)
async def create_file_upload_submission(
    assessment_id: UUID = Form(...),
    event_id: UUID | None = Form(None),
    explanation_text: str | None = Form(None, max_length=5000),
    files: list[UploadFile] = File(...),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new submission via file upload.

    Supports:
    - Single ZIP archive containing code files
    - Multiple individual code files

    Same validation rules as GitHub submissions apply:
    - Assessment must exist and be published
    - User must not have already submitted (one-attempt rule)
    - Event validation if event_id provided
    """
    # 1. Validate assessment, event, and one-attempt constraint
    assessment, event = _validate_submission_context(
        db=db,
        org=org,
        user=user,
        assessment_id=assessment_id,
        event_id=event_id,
    )

    # 2. Create submission record first (to get ID for storage path)
    submission = Submission(
        organization_id=org.id,
        candidate_id=user.id,
        assessment_id=assessment.id,
        event_id=event_id,
        submission_type="file_upload",
        explanation_text=explanation_text,
        status=SubmissionStatus.SUBMITTED,
        submitted_at=datetime.utcnow(),
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # 3. Process uploaded files
    try:
        # Check if single ZIP file
        if len(files) == 1 and files[0].filename and files[0].filename.endswith(".zip"):
            file_content = await files[0].read()
            import io

            result = await save_submission_zip(
                submission_id=submission.id,
                zip_file=io.BytesIO(file_content),
                file_size=len(file_content),
            )
        else:
            # Multiple individual files
            file_contents: list[tuple[str, bytes]] = []
            for f in files:
                content = await f.read()
                filename = f.filename or "unknown"
                file_contents.append((filename, content))

            result = await save_submission_files(
                submission_id=submission.id,
                files=file_contents,
            )

        if not result.success:
            # Delete the submission record on upload failure
            db.delete(submission)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "UPLOAD_FAILED", "message": result.error},
            )

        # Update submission with file info
        submission.uploaded_files_path = result.files_path
        submission.uploaded_file_count = result.file_count
        submission.analyzed_files = result.file_list
        db.commit()

    except HTTPException:
        raise
    except Exception as e:
        db.delete(submission)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "UPLOAD_ERROR", "message": str(e)},
        )

    # 4. Enqueue scoring job
    try:
        from app.worker.queue import enqueue_scoring_job

        job_id = enqueue_scoring_job(
            submission_id=str(submission.id),
            organization_id=str(org.id),
        )
        submission.job_id = job_id
        submission.status = SubmissionStatus.QUEUED
        db.commit()
    except Exception as e:
        submission.error_message = f"Failed to enqueue job: {str(e)}"
        db.commit()

    # 5. Log activity
    log_activity(
        db=db,
        organization_id=org.id,
        activity_type=ActivityType.SUBMISSION_CREATED,
        message=f"Submitted solution for {assessment.title} (file upload)",
        actor_id=user.id,
        target_type="submission",
        target_id=submission.id,
    )

    return {
        "success": True,
        "data": SubmissionResponse.model_validate(submission),
    }


@router.get(
    "",
    response_model=APIResponse[list[SubmissionListResponse]],
    summary="List my submissions",
)
async def list_my_submissions(
    assessment_id: Optional[UUID] = None,
    event_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List current user's submissions.
    """
    query = db.query(Submission).filter(
        Submission.organization_id == org.id,
        Submission.candidate_id == user.id,
    )

    if assessment_id:
        query = query.filter(Submission.assessment_id == assessment_id)

    if event_id:
        query = query.filter(Submission.event_id == event_id)

    if status_filter:
        try:
            status_enum = SubmissionStatus(status_filter)
            query = query.filter(Submission.status == status_enum)
        except ValueError:
            pass

    total = query.count()

    submissions = (
        query.order_by(Submission.created_at.desc()).offset(offset).limit(limit).all()
    )

    # Build response with assessment and event titles
    result = []
    for s in submissions:
        assessment = (
            db.query(Assessment).filter(Assessment.id == s.assessment_id).first()
        )
        item = SubmissionListResponse.model_validate(s)
        item.assessment_title = assessment.title if assessment else None
        if s.event_id:
            event = db.query(Event).filter(Event.id == s.event_id).first()
            item.event_title = event.title if event else None
        result.append(item)

    return {
        "success": True,
        "data": result,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
        },
    }


@router.get(
    "/{submission_id}",
    response_model=APIResponse[SubmissionDetailResponse],
    summary="Get submission detail",
)
async def get_submission(
    submission_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get submission details.

    Candidates can only view their own submissions.
    Admins can view all submissions.
    """
    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
            Submission.organization_id == org.id,
        )
        .first()
    )

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBMISSION_NOT_FOUND", "message": "Submission not found"},
        )

    # Check access
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    is_owner = submission.candidate_id == user.id
    is_admin = membership and membership.role in ("owner", "admin", "reviewer")

    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCESS_DENIED",
                "message": "You don't have access to this submission",
            },
        )

    # Build response with AI score if available
    response_data = SubmissionDetailResponse.model_validate(submission)

    # Add AI score if exists
    if submission.ai_score:
        from app.schemas.submission import AIScoreResponse

        response_data.ai_score = AIScoreResponse.model_validate(submission.ai_score)

    # Add assessment title
    response_data.assessment_title = submission.assessment.title

    return {
        "success": True,
        "data": response_data,
    }


@router.get(
    "/{submission_id}/status",
    response_model=APIResponse[SubmissionStatusResponse],
    summary="Get submission status",
)
async def get_submission_status(
    submission_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get lightweight submission status for polling.

    Use this for status updates instead of the full detail endpoint.
    """
    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
            Submission.organization_id == org.id,
            Submission.candidate_id == user.id,
        )
        .first()
    )

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBMISSION_NOT_FOUND", "message": "Submission not found"},
        )

    return {
        "success": True,
        "data": SubmissionStatusResponse.model_validate(submission),
    }


# =============================================================================
# Admin Endpoints
# =============================================================================


@router.get(
    "/admin/all",
    response_model=APIResponse[list[SubmissionListResponse]],
    summary="List all submissions (admin)",
)
async def list_all_submissions(
    assessment_id: Optional[UUID] = None,
    event_id: Optional[UUID] = None,
    candidate_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    membership=Depends(require_role("owner", "admin", "reviewer")),
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    List all submissions in the organization.

    Admin/reviewer only. Supports filtering by event.
    """
    query = db.query(Submission).filter(Submission.organization_id == org.id)

    if assessment_id:
        query = query.filter(Submission.assessment_id == assessment_id)

    if event_id:
        query = query.filter(Submission.event_id == event_id)

    if candidate_id:
        query = query.filter(Submission.candidate_id == candidate_id)

    if status_filter:
        try:
            status_enum = SubmissionStatus(status_filter)
            query = query.filter(Submission.status == status_enum)
        except ValueError:
            pass

    total = query.count()

    submissions = (
        query.order_by(Submission.created_at.desc()).offset(offset).limit(limit).all()
    )

    # Build response with assessment and event titles
    result = []
    for s in submissions:
        assessment = (
            db.query(Assessment).filter(Assessment.id == s.assessment_id).first()
        )
        item = SubmissionListResponse.model_validate(s)
        item.assessment_title = assessment.title if assessment else None
        if s.event_id:
            event = db.query(Event).filter(Event.id == s.event_id).first()
            item.event_title = event.title if event else None
        result.append(item)

    return {
        "success": True,
        "data": result,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
        },
    }


@router.post(
    "/{submission_id}/rescore",
    response_model=APIResponse[SubmissionResponse],
    summary="Rescore submission (admin)",
    dependencies=[Depends(require_not_maintenance)],
)
async def rescore_submission(
    submission_id: UUID,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Re-enqueue a submission for scoring.

    Admin only. Logs to admin_audit_log.
    """
    submission = (
        db.query(Submission)
        .filter(
            Submission.id == submission_id,
            Submission.organization_id == org.id,
        )
        .first()
    )

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBMISSION_NOT_FOUND", "message": "Submission not found"},
        )

    # Log to admin audit
    from app.models.logs import AdminAuditLog

    audit = AdminAuditLog(
        organization_id=org.id,
        admin_id=user.id,
        action="rescore",
        target_type="submission",
        target_id=submission.id,
        old_value={
            "status": submission.status.value,
            "score": str(submission.final_score),
        },
        new_value={"status": "QUEUED"},
        reason="Admin initiated rescore",
    )
    db.add(audit)

    # Reset submission status
    old_status = submission.status
    submission.status = SubmissionStatus.QUEUED
    submission.error_message = None
    submission.retry_count += 1

    # Re-enqueue job
    try:
        from app.worker.queue import enqueue_scoring_job

        job_id = enqueue_scoring_job(
            submission_id=str(submission.id),
            organization_id=str(org.id),
        )
        submission.job_id = job_id
    except Exception as e:
        submission.error_message = f"Failed to enqueue job: {str(e)}"
        submission.status = old_status

    db.commit()
    db.refresh(submission)

    return {
        "success": True,
        "data": SubmissionResponse.model_validate(submission),
    }
