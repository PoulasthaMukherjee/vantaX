"""
SQLAlchemy models for Vibe Platform.

All models are imported here for Alembic autogenerate support.
"""

# Invites
from app.models.admin_invite import AdminInvite
from app.models.ai_score import AIScore
from app.models.assessment import Assessment
from app.models.assessment_invite import AssessmentInvite

# Base classes
from app.models.base import BaseModel, TimestampMixin, UUIDMixin

# Profiles and assessments
from app.models.candidate_profile import CandidateProfile

# Enums
from app.models.enums import (
    AssessmentStatus,
    AssessmentVisibility,
    EvaluationMode,
    EventStatus,
    EventVisibility,
    SubmissionStatus,
)

# Events (hackathons)
from app.models.event import Event, EventAssessment, EventInvite, EventRegistration
from app.models.llm_usage import LLMUsageLog

# Logs
from app.models.logs import ActivityLog, AdminAuditLog, PointsLog
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser, OrganizationUserRole

# Submissions and scoring
from app.models.submission import Submission

# System
from app.models.system_config import SystemConfig

# Talent
from app.models.talent_shortlist import TalentShortlist

# Core models
from app.models.user import User

# Export all models
__all__ = [
    # Base
    "BaseModel",
    "TimestampMixin",
    "UUIDMixin",
    # Enums
    "AssessmentStatus",
    "AssessmentVisibility",
    "EvaluationMode",
    "EventStatus",
    "EventVisibility",
    "SubmissionStatus",
    "OrganizationUserRole",
    # Core models
    "User",
    "Organization",
    "OrganizationUser",
    # Invites
    "AdminInvite",
    "AssessmentInvite",
    # Profiles and assessments
    "CandidateProfile",
    "Assessment",
    # Events (hackathons)
    "Event",
    "EventAssessment",
    "EventInvite",
    "EventRegistration",
    # Submissions and scoring
    "Submission",
    "AIScore",
    # Logs
    "PointsLog",
    "ActivityLog",
    "AdminAuditLog",
    "LLMUsageLog",
    # Talent
    "TalentShortlist",
    # System
    "SystemConfig",
]
