"""
Enum types for Vibe Platform models.
"""

import enum


class AssessmentVisibility(str, enum.Enum):
    """Visibility levels for assessments."""

    ACTIVE = "active"
    INVITE_ONLY = "invite_only"
    PUBLIC = "public"


class EvaluationMode(str, enum.Enum):
    """Evaluation modes for assessments."""

    AI_ONLY = "ai_only"
    HYBRID = "hybrid"
    HUMAN_ONLY = "human_only"


class AssessmentStatus(str, enum.Enum):
    """Status of an assessment."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class SubmissionStatus(str, enum.Enum):
    """Status of a submission through the scoring pipeline."""

    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    QUEUED = "QUEUED"
    CLONING = "CLONING"
    CLONE_FAILED = "CLONE_FAILED"
    SCORING = "SCORING"
    SCORE_FAILED = "SCORE_FAILED"
    EVALUATED = "EVALUATED"


class EventStatus(str, enum.Enum):
    """Status of an event/hackathon."""

    DRAFT = "draft"
    UPCOMING = "upcoming"
    ACTIVE = "active"
    ENDED = "ended"
    ARCHIVED = "archived"


class EventVisibility(str, enum.Enum):
    """Visibility levels for events."""

    PUBLIC = "public"
    INVITE_ONLY = "invite_only"
    PRIVATE = "private"
