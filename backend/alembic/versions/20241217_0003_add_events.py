"""Add events tables for hackathons

Revision ID: 0003
Revises: 0002
Create Date: 2024-12-17

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types for events
    op.execute(
        "CREATE TYPE event_status AS ENUM ('draft', 'upcoming', 'active', 'ended', 'archived')"
    )
    op.execute(
        "CREATE TYPE event_visibility AS ENUM ('public', 'invite_only', 'private')"
    )

    # Create events table
    op.create_table(
        "events",
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
        # Basic info
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("short_description", sa.String(500), nullable=True),
        # Branding
        sa.Column("banner_url", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("theme_color", sa.String(7), nullable=True),
        # Status and visibility
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft",
                "upcoming",
                "active",
                "ended",
                "archived",
                name="event_status",
                create_type=False,
            ),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "visibility",
            postgresql.ENUM(
                "public",
                "invite_only",
                "private",
                name="event_visibility",
                create_type=False,
            ),
            nullable=False,
            server_default="public",
        ),
        # Time window
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("registration_opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("registration_closes_at", sa.DateTime(timezone=True), nullable=True),
        # Caps and limits
        sa.Column("max_participants", sa.Integer(), nullable=True),
        sa.Column(
            "max_submissions_per_user", sa.Integer(), nullable=False, server_default="1"
        ),
        # Rules and info
        sa.Column("rules", sa.Text(), nullable=True),
        sa.Column("prizes", sa.Text(), nullable=True),
        sa.Column("sponsors", postgresql.JSONB(), nullable=True),
        # Certificate settings
        sa.Column(
            "certificates_enabled", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column("certificate_template", sa.Text(), nullable=True),
        sa.Column(
            "min_score_for_certificate",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        # Tags
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        # Timestamps
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
        # Constraints
        sa.UniqueConstraint("organization_id", "slug", name="uq_events_org_slug"),
    )

    # Create indexes for events
    op.create_index("idx_events_org_status", "events", ["organization_id", "status"])
    op.create_index("idx_events_dates", "events", ["starts_at", "ends_at"])

    # Create event_registrations table
    op.create_table(
        "event_registrations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Registration details
        sa.Column(
            "registered_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Certificate tracking
        sa.Column(
            "certificate_issued", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("certificate_issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("certificate_url", sa.Text(), nullable=True),
        # Timestamps
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
        # Constraints
        sa.UniqueConstraint(
            "event_id", "user_id", name="uq_event_registrations_event_user"
        ),
    )

    # Create indexes for event_registrations
    op.create_index(
        "idx_event_registrations_event", "event_registrations", ["event_id"]
    )
    op.create_index("idx_event_registrations_user", "event_registrations", ["user_id"])

    # Create event_assessments table (many-to-many link)
    op.create_table(
        "event_assessments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
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
        # Ordering and overrides
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "points_multiplier", sa.Float(), nullable=False, server_default="1.0"
        ),
        # Timestamps
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
        # Constraints
        sa.UniqueConstraint(
            "event_id", "assessment_id", name="uq_event_assessments_event_assessment"
        ),
    )

    # Add event_id to submissions table
    op.add_column(
        "submissions",
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_submissions_event", "submissions", ["event_id"])


def downgrade() -> None:
    # Remove event_id from submissions
    op.drop_index("idx_submissions_event", table_name="submissions")
    op.drop_column("submissions", "event_id")

    # Drop event_assessments table
    op.drop_table("event_assessments")

    # Drop event_registrations table
    op.drop_index("idx_event_registrations_user", table_name="event_registrations")
    op.drop_index("idx_event_registrations_event", table_name="event_registrations")
    op.drop_table("event_registrations")

    # Drop events table
    op.drop_index("idx_events_dates", table_name="events")
    op.drop_index("idx_events_org_status", table_name="events")
    op.drop_table("events")

    # Drop enum types
    op.execute("DROP TYPE event_visibility")
    op.execute("DROP TYPE event_status")
