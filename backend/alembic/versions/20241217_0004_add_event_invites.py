"""Add event_invites table for invite_only events

Revision ID: 0004
Revises: 0003
Create Date: 2024-12-17

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create event_invites table
    op.create_table(
        "event_invites",
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
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "invited_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Unique constraint: one invite per email per event
    op.create_unique_constraint(
        "uq_event_invites_event_email", "event_invites", ["event_id", "email"]
    )

    # Indexes for common queries
    op.create_index("idx_event_invites_event", "event_invites", ["event_id"])
    op.create_index("idx_event_invites_email", "event_invites", ["email"])


def downgrade() -> None:
    op.drop_index("idx_event_invites_email", table_name="event_invites")
    op.drop_index("idx_event_invites_event", table_name="event_invites")
    op.drop_constraint("uq_event_invites_event_email", "event_invites", type_="unique")
    op.drop_table("event_invites")
