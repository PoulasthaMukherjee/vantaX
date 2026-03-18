"""
Assessment schemas.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmBase

# =============================================================================
# Assessment Schemas
# =============================================================================


class AssessmentBase(BaseModel):
    """Base assessment fields."""

    title: str = Field(..., min_length=1, max_length=255)
    problem_statement: str = Field(..., min_length=10)
    build_requirements: str = Field(..., min_length=10)
    input_output_examples: str = Field(..., min_length=10)
    acceptance_criteria: str = Field(..., min_length=10)
    constraints: str = Field(..., min_length=10)
    submission_instructions: str = Field(..., min_length=10)

    starter_code: str | None = None
    helpful_docs: str | None = None

    visibility: str = Field(
        default="active", pattern=r"^(public|active|invite_only|hidden)$"
    )
    evaluation_mode: str = Field(
        default="ai_only", pattern=r"^(ai_only|hybrid|manual_only)$"
    )
    time_limit_days: int | None = Field(None, ge=1, le=365)
    tags: list[str] | None = None

    # File patterns for filtering (glob patterns like "*.py", "src/**/*.ts", "!**/test/**")
    # NULL means use global defaults (all code files)
    file_patterns: list[str] | None = Field(
        None,
        description="Glob patterns for file filtering. Examples: ['*.py', 'src/**/*.ts', '!**/test/**']",
    )

    # Rubric weights (must sum to 100)
    weight_correctness: int = Field(default=25, ge=0, le=100)
    weight_quality: int = Field(default=20, ge=0, le=100)
    weight_readability: int = Field(default=15, ge=0, le=100)
    weight_robustness: int = Field(default=10, ge=0, le=100)
    weight_clarity: int = Field(default=10, ge=0, le=100)
    weight_depth: int = Field(default=10, ge=0, le=100)
    weight_structure: int = Field(default=10, ge=0, le=100)


class AssessmentCreate(AssessmentBase):
    """Schema for creating an assessment."""

    pass


class AssessmentUpdate(BaseModel):
    """Schema for updating an assessment."""

    title: str | None = Field(None, min_length=1, max_length=255)
    problem_statement: str | None = None
    build_requirements: str | None = None
    input_output_examples: str | None = None
    acceptance_criteria: str | None = None
    constraints: str | None = None
    submission_instructions: str | None = None
    starter_code: str | None = None
    helpful_docs: str | None = None
    visibility: str | None = Field(
        None, pattern=r"^(public|active|invite_only|hidden)$"
    )
    status: str | None = Field(None, pattern=r"^(draft|published|archived)$")
    time_limit_days: int | None = Field(None, ge=1, le=365)
    tags: list[str] | None = None
    file_patterns: list[str] | None = None


class AssessmentResponse(OrmBase):
    """Assessment response schema."""

    id: UUID
    organization_id: UUID
    created_by: UUID

    title: str
    problem_statement: str
    build_requirements: str
    input_output_examples: str
    acceptance_criteria: str
    constraints: str
    submission_instructions: str

    starter_code: str | None
    helpful_docs: str | None

    visibility: str
    evaluation_mode: str
    status: str
    time_limit_days: int | None
    tags: list[str] | None
    file_patterns: list[str] | None

    weight_correctness: int
    weight_quality: int
    weight_readability: int
    weight_robustness: int
    weight_clarity: int
    weight_depth: int
    weight_structure: int

    created_at: datetime
    updated_at: datetime


class AssessmentListResponse(OrmBase):
    """Simplified assessment for list views."""

    id: UUID
    title: str
    problem_statement: str
    visibility: str
    status: str
    time_limit_days: int | None
    tags: list[str] | None
    created_at: datetime


# =============================================================================
# AI Generation Schemas
# =============================================================================


class AssessmentGenerateRequest(BaseModel):
    """Request to generate assessment content using AI."""

    description: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Brief description of the desired assessment",
    )
    difficulty: str = Field(
        default="intermediate",
        pattern=r"^(easy|intermediate|hard)$",
        description="Target difficulty level",
    )
    role: str | None = Field(
        default=None,
        max_length=100,
        description="Target role (e.g., 'backend engineer')",
    )
    time_limit_days: int = Field(
        default=3,
        ge=1,
        le=30,
        description="Expected completion time in days",
    )
    tags: list[str] | None = Field(
        default=None,
        description="Relevant skill tags",
    )


class AssessmentGenerateResponse(BaseModel):
    """Generated assessment content (draft for review)."""

    title: str
    problem_statement: str
    build_requirements: str
    input_output_examples: str
    acceptance_criteria: str
    constraints: str
    submission_instructions: str
    starter_code: str | None = None
    helpful_docs: str | None = None
    suggested_tags: list[str] | None = None
