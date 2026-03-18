"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2024-12-02

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types
    op.execute(
        "CREATE TYPE organization_user_role AS ENUM ('owner', 'admin', 'reviewer', 'candidate')"
    )
    op.execute(
        "CREATE TYPE assessment_visibility AS ENUM ('active', 'invite_only', 'public')"
    )
    op.execute(
        "CREATE TYPE evaluation_mode AS ENUM ('ai_only', 'hybrid', 'human_only')"
    )
    op.execute(
        "CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived')"
    )
    op.execute(
        "CREATE TYPE submission_status AS ENUM ('DRAFT', 'SUBMITTED', 'QUEUED', 'CLONING', 'CLONE_FAILED', 'SCORING', 'SCORE_FAILED', 'EVALUATED')"
    )

    # Users table
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "firebase_uid", sa.String(128), unique=True, nullable=False, index=True
        ),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column(
            "email_verified", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    # Organizations table
    op.create_table(
        "organizations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("plan", sa.String(20), nullable=False, server_default="free"),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    # Organization users (memberships)
    op.create_table(
        "organization_users",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "role",
            postgresql.ENUM(
                "owner",
                "admin",
                "reviewer",
                "candidate",
                name="organization_user_role",
                create_type=False,
            ),
            nullable=False,
            server_default="candidate",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Admin invites
    op.create_table(
        "admin_invites",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM(
                "owner",
                "admin",
                "reviewer",
                "candidate",
                name="organization_user_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "organization_id", "email", name="uq_admin_invites_org_email"
        ),
    )

    # Candidate profiles
    op.create_table(
        "candidate_profiles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("mobile", sa.String(20), nullable=True),
        sa.Column("github_url", sa.Text(), nullable=True),
        sa.Column(
            "github_verified", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("linkedin_url", sa.Text(), nullable=True),
        sa.Column("resume_file_path", sa.Text(), nullable=True),
        sa.Column("resume_filename", sa.String(255), nullable=True),
        sa.Column("about_me", sa.Text(), nullable=True),
        sa.Column("vibe_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("total_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "organization_id", "user_id", name="uq_candidate_profiles_org_user"
        ),
    )

    # Assessments
    op.create_table(
        "assessments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("problem_statement", sa.Text(), nullable=False),
        sa.Column("build_requirements", sa.Text(), nullable=False),
        sa.Column("input_output_examples", sa.Text(), nullable=False),
        sa.Column("acceptance_criteria", sa.Text(), nullable=False),
        sa.Column("constraints", sa.Text(), nullable=False),
        sa.Column("starter_code", sa.Text(), nullable=True),
        sa.Column("helpful_docs", sa.Text(), nullable=True),
        sa.Column("submission_instructions", sa.Text(), nullable=False),
        sa.Column(
            "visibility",
            postgresql.ENUM(
                "active",
                "invite_only",
                "public",
                name="assessment_visibility",
                create_type=False,
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "evaluation_mode",
            postgresql.ENUM(
                "ai_only",
                "hybrid",
                "human_only",
                name="evaluation_mode",
                create_type=False,
            ),
            nullable=False,
            server_default="ai_only",
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft",
                "published",
                "archived",
                name="assessment_status",
                create_type=False,
            ),
            nullable=False,
            server_default="published",
        ),
        sa.Column("time_limit_days", sa.Integer(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column(
            "weight_correctness", sa.Integer(), nullable=False, server_default="25"
        ),
        sa.Column("weight_quality", sa.Integer(), nullable=False, server_default="20"),
        sa.Column(
            "weight_readability", sa.Integer(), nullable=False, server_default="15"
        ),
        sa.Column(
            "weight_robustness", sa.Integer(), nullable=False, server_default="10"
        ),
        sa.Column("weight_clarity", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("weight_depth", sa.Integer(), nullable=False, server_default="10"),
        sa.Column(
            "weight_structure", sa.Integer(), nullable=False, server_default="10"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "weight_correctness + weight_quality + weight_readability + weight_robustness + weight_clarity + weight_depth + weight_structure = 100",
            name="ck_assessments_weights_sum_100",
        ),
    )
    op.create_index(
        "idx_assessments_tags", "assessments", ["tags"], postgresql_using="gin"
    )

    # Assessment invites
    op.create_table(
        "assessment_invites",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessments.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "assessment_id", "email", name="uq_assessment_invites_assessment_email"
        ),
    )

    # Submissions
    op.create_table(
        "submissions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("github_repo_url", sa.Text(), nullable=False),
        sa.Column("explanation_text", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "DRAFT",
                "SUBMITTED",
                "QUEUED",
                "CLONING",
                "CLONE_FAILED",
                "SCORING",
                "SCORE_FAILED",
                "EVALUATED",
                name="submission_status",
                create_type=False,
            ),
            nullable=False,
            server_default="SUBMITTED",
        ),
        sa.Column("commit_sha", sa.String(40), nullable=True),
        sa.Column("analyzed_files", postgresql.JSONB(), nullable=True),
        sa.Column("clone_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clone_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("job_id", sa.String(100), nullable=True),
        sa.Column("job_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("job_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("final_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("points_awarded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "organization_id",
            "candidate_id",
            "assessment_id",
            name="uq_submissions_org_candidate_assessment",
        ),
    )
    op.create_index(
        "idx_submissions_org_status", "submissions", ["organization_id", "status"]
    )
    op.create_index(
        "idx_submissions_org_candidate",
        "submissions",
        ["organization_id", "candidate_id"],
    )

    # AI Scores
    op.create_table(
        "ai_scores",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("code_correctness", sa.Integer(), nullable=False),
        sa.Column("code_quality", sa.Integer(), nullable=False),
        sa.Column("code_readability", sa.Integer(), nullable=False),
        sa.Column("code_robustness", sa.Integer(), nullable=False),
        sa.Column("reasoning_clarity", sa.Integer(), nullable=False),
        sa.Column("reasoning_depth", sa.Integer(), nullable=False),
        sa.Column("reasoning_structure", sa.Integer(), nullable=False),
        sa.Column("overall_comment", sa.Text(), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "code_correctness BETWEEN 1 AND 10", name="ck_ai_scores_correctness"
        ),
        sa.CheckConstraint(
            "code_quality BETWEEN 1 AND 10", name="ck_ai_scores_quality"
        ),
        sa.CheckConstraint(
            "code_readability BETWEEN 1 AND 10", name="ck_ai_scores_readability"
        ),
        sa.CheckConstraint(
            "code_robustness BETWEEN 1 AND 10", name="ck_ai_scores_robustness"
        ),
        sa.CheckConstraint(
            "reasoning_clarity BETWEEN 1 AND 10", name="ck_ai_scores_clarity"
        ),
        sa.CheckConstraint(
            "reasoning_depth BETWEEN 1 AND 10", name="ck_ai_scores_depth"
        ),
        sa.CheckConstraint(
            "reasoning_structure BETWEEN 1 AND 10", name="ck_ai_scores_structure"
        ),
    )

    # Points log
    op.create_table(
        "points_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("event", sa.String(100), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("event_data", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "organization_id", "user_id", "event", name="uq_points_log_org_user_event"
        ),
    )

    # Activity log
    op.create_table(
        "activity_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("target_type", sa.String(50), nullable=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("event_data", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_activity_log_org", "activity_log", ["organization_id", "created_at"]
    )
    op.create_index(
        "idx_activity_log_target", "activity_log", ["target_type", "target_id"]
    )

    # Admin audit log
    op.create_table(
        "admin_audit_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("old_value", postgresql.JSONB(), nullable=True),
        sa.Column("new_value", postgresql.JSONB(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_audit_log_org", "admin_audit_log", ["organization_id", "created_at"]
    )
    op.create_index("idx_audit_log_admin", "admin_audit_log", ["admin_id"])
    op.create_index(
        "idx_audit_log_target", "admin_audit_log", ["target_type", "target_id"]
    )

    # LLM usage log
    op.create_table(
        "llm_usage_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error_type", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_llm_usage_org", "llm_usage_log", ["organization_id", "created_at"]
    )
    op.create_index("idx_llm_usage_submission", "llm_usage_log", ["submission_id"])

    # System config
    op.create_table(
        "system_config",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    # Seed maintenance_mode
    op.execute(
        "INSERT INTO system_config (key, value) VALUES ('maintenance_mode', 'false')"
    )


def downgrade() -> None:
    op.drop_table("system_config")
    op.drop_table("llm_usage_log")
    op.drop_table("admin_audit_log")
    op.drop_table("activity_log")
    op.drop_table("points_log")
    op.drop_table("ai_scores")
    op.drop_table("submissions")
    op.drop_table("assessment_invites")
    op.drop_table("assessments")
    op.drop_table("candidate_profiles")
    op.drop_table("admin_invites")
    op.drop_table("organization_users")
    op.drop_table("organizations")
    op.drop_table("users")

    op.execute("DROP TYPE submission_status")
    op.execute("DROP TYPE assessment_status")
    op.execute("DROP TYPE evaluation_mode")
    op.execute("DROP TYPE assessment_visibility")
    op.execute("DROP TYPE organization_user_role")
