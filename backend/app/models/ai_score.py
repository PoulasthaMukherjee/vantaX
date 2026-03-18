"""
AIScore model - rubric-level scores per submission.
"""

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.submission import Submission


class AIScore(BaseModel):
    """
    AI-generated rubric scores for a submission.

    One score record per submission (1:1 relationship).
    All scores are on a 1-10 scale.
    """

    __tablename__ = "ai_scores"
    __table_args__ = (
        CheckConstraint(
            "code_correctness BETWEEN 1 AND 10", name="ck_ai_scores_correctness"
        ),
        CheckConstraint("code_quality BETWEEN 1 AND 10", name="ck_ai_scores_quality"),
        CheckConstraint(
            "code_readability BETWEEN 1 AND 10", name="ck_ai_scores_readability"
        ),
        CheckConstraint(
            "code_robustness BETWEEN 1 AND 10", name="ck_ai_scores_robustness"
        ),
        CheckConstraint(
            "reasoning_clarity BETWEEN 1 AND 10", name="ck_ai_scores_clarity"
        ),
        CheckConstraint("reasoning_depth BETWEEN 1 AND 10", name="ck_ai_scores_depth"),
        CheckConstraint(
            "reasoning_structure BETWEEN 1 AND 10", name="ck_ai_scores_structure"
        ),
    )

    # Organization scope
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # Submission (unique - one score per submission)
    submission_id: Mapped[UUID] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"),
        unique=True,
    )

    # Code rubric scores (1-10)
    code_correctness: Mapped[int] = mapped_column()
    code_quality: Mapped[int] = mapped_column()
    code_readability: Mapped[int] = mapped_column()
    code_robustness: Mapped[int] = mapped_column()

    # Reasoning rubric scores (1-10)
    reasoning_clarity: Mapped[int] = mapped_column()
    reasoning_depth: Mapped[int] = mapped_column()
    reasoning_structure: Mapped[int] = mapped_column()

    # LLM feedback
    overall_comment: Mapped[str | None] = mapped_column(Text)
    raw_response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # Relationships
    organization: Mapped["Organization"] = relationship()
    submission: Mapped["Submission"] = relationship(back_populates="ai_score")

    def __repr__(self) -> str:
        return f"<AIScore submission={self.submission_id}>"

    @property
    def scores_dict(self) -> dict[str, int]:
        """Get all scores as a dictionary."""
        return {
            "correctness": self.code_correctness,
            "quality": self.code_quality,
            "readability": self.code_readability,
            "robustness": self.code_robustness,
            "clarity": self.reasoning_clarity,
            "depth": self.reasoning_depth,
            "structure": self.reasoning_structure,
        }

    def calculate_weighted_score(self, weights: dict[str, int]) -> float:
        """
        Calculate final weighted score.

        Args:
            weights: Dictionary of weight percentages (must sum to 100)

        Returns:
            Weighted average score (0-100 scale)
        """
        scores = self.scores_dict
        total = sum(scores[k] * weights.get(k, 0) for k in scores)
        return total / 10  # Convert from 1-10 scale to percentage contribution
