"""
Submission model - org-scoped submission attempts.
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.enums import SubmissionStatus

if TYPE_CHECKING:
    from app.models.ai_score import AIScore
    from app.models.assessment import Assessment
    from app.models.event import Event
    from app.models.organization import Organization
    from app.models.user import User


class Submission(BaseModel):
    """
    Submission attempt for an assessment.

    One submission per (organization, candidate, assessment) - enforced by unique constraint.
    Tracks status through the scoring pipeline.
    """

    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "candidate_id",
            "assessment_id",
            name="uq_submissions_org_candidate_assessment",
        ),
        Index("idx_submissions_org_status", "organization_id", "status"),
        Index("idx_submissions_org_candidate", "organization_id", "candidate_id"),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
    )

    # Candidate (user submitting)
    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
    )

    # Assessment being submitted to
    assessment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"),
    )

    # Optional event context (for hackathons)
    event_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"),
        index=True,
    )

    # Integration mapping
    external_id: Mapped[str | None] = mapped_column(String(100), index=True)

    # Submission content
    # submission_type: "github" for GitHub URL, "file_upload" for uploaded files
    submission_type: Mapped[str] = mapped_column(String(20), default="github")
    github_repo_url: Mapped[str | None] = mapped_column(Text)
    uploaded_files_path: Mapped[str | None] = mapped_column(Text)
    uploaded_file_count: Mapped[int | None] = mapped_column()
    explanation_text: Mapped[str | None] = mapped_column(Text)

    # Pipeline status
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status"),
        default=SubmissionStatus.SUBMITTED,
    )

    # Git metadata
    commit_sha: Mapped[str | None] = mapped_column(String(40))
    analyzed_files: Mapped[list[str] | None] = mapped_column(JSONB)

    # Clone timing
    clone_started_at: Mapped[datetime | None] = mapped_column()
    clone_completed_at: Mapped[datetime | None] = mapped_column()

    # Job tracking
    job_id: Mapped[str | None] = mapped_column(String(100))
    job_started_at: Mapped[datetime | None] = mapped_column()
    job_completed_at: Mapped[datetime | None] = mapped_column()

    # Scoring results
    final_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    points_awarded: Mapped[int] = mapped_column(default=0)

    # Error handling
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(default=0)

    # Timestamps
    submitted_at: Mapped[datetime | None] = mapped_column()
    evaluated_at: Mapped[datetime | None] = mapped_column()

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="submissions")
    candidate: Mapped["User"] = relationship(back_populates="submissions")
    assessment: Mapped["Assessment"] = relationship(back_populates="submissions")
    event: Mapped["Event | None"] = relationship(back_populates="submissions")
    ai_score: Mapped["AIScore | None"] = relationship(
        back_populates="submission",
        uselist=False,
    )

    def __repr__(self) -> str:
        return f"<Submission {self.id} ({self.status})>"

    @property
    def is_terminal(self) -> bool:
        """Check if submission is in a terminal state."""
        return self.status in (
            SubmissionStatus.EVALUATED,
            SubmissionStatus.CLONE_FAILED,
            SubmissionStatus.SCORE_FAILED,
        )

    @property
    def is_failed(self) -> bool:
        """Check if submission failed."""
        return self.status in (
            SubmissionStatus.CLONE_FAILED,
            SubmissionStatus.SCORE_FAILED,
        )
