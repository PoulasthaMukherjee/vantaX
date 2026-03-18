"""
Assessment model - org-scoped assessments with visibility and evaluation mode.
"""

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ARRAY, CheckConstraint, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.enums import AssessmentStatus, AssessmentVisibility, EvaluationMode

if TYPE_CHECKING:
    from app.models.assessment_invite import AssessmentInvite
    from app.models.organization import Organization
    from app.models.submission import Submission
    from app.models.user import User


class Assessment(BaseModel):
    """
    Assessment (coding challenge) scoped to an organization.

    Contains problem statement, requirements, and rubric weights.
    """

    __tablename__ = "assessments"
    __table_args__ = (
        CheckConstraint(
            "weight_correctness + weight_quality + weight_readability + "
            "weight_robustness + weight_clarity + weight_depth + weight_structure = 100",
            name="ck_assessments_weights_sum_100",
        ),
        Index("idx_assessments_tags", "tags", postgresql_using="gin"),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # Creator
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    # Basic info
    title: Mapped[str] = mapped_column(String(255))

    # Problem definition
    problem_statement: Mapped[str] = mapped_column(Text)
    build_requirements: Mapped[str] = mapped_column(Text)
    input_output_examples: Mapped[str] = mapped_column(Text)
    acceptance_criteria: Mapped[str] = mapped_column(Text)
    constraints: Mapped[str] = mapped_column(Text)

    # Optional helpers
    starter_code: Mapped[str | None] = mapped_column(Text)
    helpful_docs: Mapped[str | None] = mapped_column(Text)
    submission_instructions: Mapped[str] = mapped_column(Text)

    # Visibility and mode
    visibility: Mapped[AssessmentVisibility] = mapped_column(
        Enum(
            AssessmentVisibility,
            name="assessment_visibility",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AssessmentVisibility.ACTIVE,
    )
    evaluation_mode: Mapped[EvaluationMode] = mapped_column(
        Enum(
            EvaluationMode,
            name="evaluation_mode",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=EvaluationMode.AI_ONLY,
    )
    status: Mapped[AssessmentStatus] = mapped_column(
        Enum(
            AssessmentStatus,
            name="assessment_status",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AssessmentStatus.PUBLISHED,
    )

    # Time limit (optional, in days)
    time_limit_days: Mapped[int | None] = mapped_column()

    # Tags for filtering
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # File patterns for submission filtering (glob patterns)
    # Examples: ["*.py", "src/**/*.ts", "!**/test/**"]
    # NULL means use global defaults (all code files)
    file_patterns: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # Rubric weights (must sum to 100)
    weight_correctness: Mapped[int] = mapped_column(default=25)
    weight_quality: Mapped[int] = mapped_column(default=20)
    weight_readability: Mapped[int] = mapped_column(default=15)
    weight_robustness: Mapped[int] = mapped_column(default=10)
    weight_clarity: Mapped[int] = mapped_column(default=10)
    weight_depth: Mapped[int] = mapped_column(default=10)
    weight_structure: Mapped[int] = mapped_column(default=10)

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="assessments")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="assessment",
        cascade="all, delete-orphan",
    )
    invites: Mapped[list["AssessmentInvite"]] = relationship(
        back_populates="assessment",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Assessment {self.title} ({self.status})>"

    @property
    def weights_dict(self) -> dict[str, int]:
        """Get rubric weights as a dictionary."""
        return {
            "correctness": self.weight_correctness,
            "quality": self.weight_quality,
            "readability": self.weight_readability,
            "robustness": self.weight_robustness,
            "clarity": self.weight_clarity,
            "depth": self.weight_depth,
            "structure": self.weight_structure,
        }
