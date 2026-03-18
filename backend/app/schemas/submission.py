"""
Submission schemas.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmBase

# =============================================================================
# Submission Schemas
# =============================================================================


class SubmissionCreate(BaseModel):
    """Schema for creating a GitHub URL submission."""

    assessment_id: UUID
    github_repo_url: str = Field(..., min_length=10, max_length=500)
    explanation_text: str | None = Field(None, max_length=5000)
    event_id: UUID | None = None  # Optional event context for hackathons


class SubmissionFileUploadCreate(BaseModel):
    """Schema for file upload submission metadata (used with multipart form)."""

    assessment_id: UUID
    explanation_text: str | None = Field(None, max_length=5000)
    event_id: UUID | None = None


class SubmissionResponse(OrmBase):
    """Submission response schema."""

    id: UUID
    organization_id: UUID
    candidate_id: UUID
    assessment_id: UUID
    event_id: UUID | None = None

    submission_type: str  # "github" or "file_upload"
    github_repo_url: str | None  # NULL for file_upload submissions
    uploaded_files_path: str | None  # NULL for github submissions
    uploaded_file_count: int | None  # NULL for github submissions
    explanation_text: str | None

    status: str
    commit_sha: str | None
    analyzed_files: list[str] | None

    clone_started_at: datetime | None
    clone_completed_at: datetime | None
    job_started_at: datetime | None
    job_completed_at: datetime | None

    final_score: Decimal | None
    points_awarded: int

    error_message: str | None
    retry_count: int

    submitted_at: datetime | None
    evaluated_at: datetime | None

    created_at: datetime
    updated_at: datetime


class SubmissionListResponse(OrmBase):
    """Simplified submission for list views."""

    id: UUID
    assessment_id: UUID
    event_id: UUID | None = None
    submission_type: str
    github_repo_url: str | None
    uploaded_file_count: int | None
    status: str
    final_score: Decimal | None
    submitted_at: datetime | None
    evaluated_at: datetime | None
    assessment_title: str | None = None
    event_title: str | None = None


class SubmissionStatusResponse(OrmBase):
    """Lightweight status response for polling."""

    id: UUID
    status: str
    final_score: Decimal | None
    error_message: str | None
    evaluated_at: datetime | None


# =============================================================================
# AI Score Schemas
# =============================================================================


class AIScoreResponse(OrmBase):
    """AI score response schema."""

    id: UUID
    submission_id: UUID

    code_correctness: int
    code_quality: int
    code_readability: int
    code_robustness: int
    reasoning_clarity: int
    reasoning_depth: int
    reasoning_structure: int

    overall_comment: str | None
    created_at: datetime


class SubmissionDetailResponse(SubmissionResponse):
    """Full submission detail with AI scores."""

    ai_score: AIScoreResponse | None = None
    assessment_title: str | None = None
