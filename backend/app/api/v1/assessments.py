"""
Assessments API endpoints.

Handles assessment listing and detail views.
Admin CRUD operations in separate admin module.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_org,
    get_current_user,
    get_db,
    require_not_maintenance,
    require_role,
)
from app.models.assessment import Assessment
from app.models.enums import AssessmentStatus, AssessmentVisibility
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.models.user import User
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentGenerateRequest,
    AssessmentGenerateResponse,
    AssessmentListResponse,
    AssessmentResponse,
    AssessmentUpdate,
)
from app.schemas.common import APIResponse, PaginatedResponse

router = APIRouter()


# =============================================================================
# Assessment List/Detail (Candidates)
# =============================================================================


@router.get(
    "",
    response_model=APIResponse[list[AssessmentListResponse]],
    summary="List assessments",
)
async def list_assessments(
    status_filter: Optional[str] = Query(None, alias="status"),
    tag: Optional[str] = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List assessments in the current organization.

    Candidates see only published assessments with appropriate visibility.
    Admins/owners see all assessments.
    """
    # Check user's role
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    is_admin = membership and membership.role in ("owner", "admin", "reviewer")

    # Build query
    query = db.query(Assessment).filter(Assessment.organization_id == org.id)

    # Non-admins can only see published, visible assessments
    if not is_admin:
        query = query.filter(
            Assessment.status == AssessmentStatus.PUBLISHED,
            Assessment.visibility.in_(
                [
                    AssessmentVisibility.PUBLIC,
                    AssessmentVisibility.ACTIVE,
                ]
            ),
        )

    # Status filter (admin only)
    if status_filter and is_admin:
        try:
            status_enum = AssessmentStatus(status_filter)
            query = query.filter(Assessment.status == status_enum)
        except ValueError:
            pass

    # Tag filter
    if tag:
        query = query.filter(Assessment.tags.contains([tag]))

    # Get total count for pagination
    total = query.count()

    # Apply pagination and ordering
    assessments = (
        query.order_by(Assessment.created_at.desc()).offset(offset).limit(limit).all()
    )

    return {
        "success": True,
        "data": [AssessmentListResponse.model_validate(a) for a in assessments],
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
        },
    }


@router.get(
    "/{assessment_id}",
    response_model=APIResponse[AssessmentResponse],
    summary="Get assessment detail",
)
async def get_assessment(
    assessment_id: UUID,
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get assessment details.

    Candidates can only view published, visible assessments.
    Admins can view all assessments.
    """
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == assessment_id,
            Assessment.organization_id == org.id,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSESSMENT_NOT_FOUND", "message": "Assessment not found"},
        )

    # Check user's role for visibility
    membership = (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == org.id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )

    is_admin = membership and membership.role in ("owner", "admin", "reviewer")

    # Non-admins can only see published, visible assessments
    if not is_admin:
        if assessment.status != AssessmentStatus.PUBLISHED:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "ASSESSMENT_NOT_FOUND",
                    "message": "Assessment not found",
                },
            )
        if assessment.visibility not in (
            AssessmentVisibility.PUBLIC,
            AssessmentVisibility.ACTIVE,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ASSESSMENT_NOT_VISIBLE",
                    "message": "This assessment is not available",
                },
            )

    return {
        "success": True,
        "data": AssessmentResponse.model_validate(assessment),
    }


# =============================================================================
# Assessment CRUD (Admin)
# =============================================================================


@router.post(
    "",
    response_model=APIResponse[AssessmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create assessment",
    dependencies=[Depends(require_not_maintenance)],
)
async def create_assessment(
    data: AssessmentCreate,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new assessment.

    Only owners and admins can create assessments.
    Rubric weights must sum to 100.
    """
    # Validate weights sum to 100
    total_weight = (
        data.weight_correctness
        + data.weight_quality
        + data.weight_readability
        + data.weight_robustness
        + data.weight_clarity
        + data.weight_depth
        + data.weight_structure
    )

    if total_weight != 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_WEIGHTS",
                "message": f"Rubric weights must sum to 100 (got {total_weight})",
            },
        )

    assessment = Assessment(
        organization_id=org.id,
        created_by=user.id,
        **data.model_dump(),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    # Log activity
    from app.services.activity import ActivityType, log_activity

    log_activity(
        db=db,
        organization_id=org.id,
        activity_type=ActivityType.ASSESSMENT_CREATED,
        message=f"Created assessment: {assessment.title}",
        actor_id=user.id,
        target_type="assessment",
        target_id=assessment.id,
    )

    return {
        "success": True,
        "data": AssessmentResponse.model_validate(assessment),
    }


@router.patch(
    "/{assessment_id}",
    response_model=APIResponse[AssessmentResponse],
    summary="Update assessment",
    dependencies=[Depends(require_not_maintenance)],
)
async def update_assessment(
    assessment_id: UUID,
    data: AssessmentUpdate,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update an assessment.

    Only owners and admins can update assessments.
    Cannot update archived assessments.
    """
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == assessment_id,
            Assessment.organization_id == org.id,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSESSMENT_NOT_FOUND", "message": "Assessment not found"},
        )

    if assessment.status == AssessmentStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_UPDATE_ARCHIVED",
                "message": "Cannot update archived assessment",
            },
        )

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(assessment, field):
            setattr(assessment, field, value)

    db.commit()
    db.refresh(assessment)

    return {
        "success": True,
        "data": AssessmentResponse.model_validate(assessment),
    }


@router.post(
    "/{assessment_id}/archive",
    response_model=APIResponse[AssessmentResponse],
    summary="Archive assessment",
    dependencies=[Depends(require_not_maintenance)],
)
async def archive_assessment(
    assessment_id: UUID,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Archive an assessment.

    Archived assessments cannot receive new submissions.
    """
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == assessment_id,
            Assessment.organization_id == org.id,
        )
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSESSMENT_NOT_FOUND", "message": "Assessment not found"},
        )

    if assessment.status == AssessmentStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_ARCHIVED",
                "message": "Assessment is already archived",
            },
        )

    assessment.status = AssessmentStatus.ARCHIVED
    db.commit()
    db.refresh(assessment)

    # Log activity
    from app.services.activity import ActivityType, log_activity

    log_activity(
        db=db,
        organization_id=org.id,
        activity_type=ActivityType.ASSESSMENT_ARCHIVED,
        message=f"Archived assessment: {assessment.title}",
        actor_id=user.id,
        target_type="assessment",
        target_id=assessment.id,
    )

    return {
        "success": True,
        "data": AssessmentResponse.model_validate(assessment),
    }


# =============================================================================
# AI Generation
# =============================================================================


@router.post(
    "/generate",
    response_model=APIResponse[AssessmentGenerateResponse],
    summary="Generate assessment with AI",
    dependencies=[Depends(require_not_maintenance)],
)
async def generate_assessment_ai(
    data: AssessmentGenerateRequest,
    membership=Depends(require_role("owner", "admin")),
    org: Organization = Depends(get_current_org),
    user: User = Depends(get_current_user),
):
    """
    Generate assessment content using AI.

    Takes a brief description and returns a draft assessment
    with all required fields populated. The draft can be
    reviewed and edited before saving.

    Only owners and admins can generate assessments.
    """
    import json
    from app.worker.tasks.assessment_generator import generate_assessment

    def to_string(value) -> str:
        """Convert value to string, joining lists with newlines."""
        if value is None:
            return ""
        if isinstance(value, list):
            return "\n".join(f"- {item}" if isinstance(item, str) else str(item) for item in value)
        if isinstance(value, dict):
            return json.dumps(value, indent=2)
        return str(value)

    def to_optional_string(value) -> str | None:
        """Convert value to string or None."""
        if value is None:
            return None
        return to_string(value)

    try:
        result = generate_assessment(
            description=data.description,
            difficulty=data.difficulty,
            role=data.role,
            time_limit_days=data.time_limit_days,
            tags=data.tags,
        )

        return {
            "success": True,
            "data": AssessmentGenerateResponse(
                title=to_string(result.get("title", "")),
                problem_statement=to_string(result.get("problem_statement", "")),
                build_requirements=to_string(result.get("build_requirements", "")),
                input_output_examples=to_string(result.get("input_output_examples", "")),
                acceptance_criteria=to_string(result.get("acceptance_criteria", "")),
                constraints=to_string(result.get("constraints", "")),
                submission_instructions=to_string(result.get("submission_instructions", "")),
                starter_code=to_optional_string(result.get("starter_code")),
                helpful_docs=to_optional_string(result.get("helpful_docs")),
                suggested_tags=result.get("suggested_tags"),
            ),
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "GENERATION_FAILED",
                "message": f"Failed to generate assessment: {str(e)}",
            },
        )
