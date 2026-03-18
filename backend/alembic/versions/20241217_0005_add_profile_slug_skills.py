"""Add slug and skills columns to candidate_profiles

Revision ID: 0005
Revises: 0004
Create Date: 2024-12-17

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add slug column (globally unique for public URLs)
    op.add_column(
        "candidate_profiles", sa.Column("slug", sa.String(100), nullable=True)
    )
    op.create_unique_constraint(
        "uq_candidate_profiles_slug", "candidate_profiles", ["slug"]
    )

    # Add skills array column
    op.add_column(
        "candidate_profiles",
        sa.Column("skills", postgresql.ARRAY(sa.String()), nullable=True),
    )

    # Add indexes for talent search
    op.create_index(
        "idx_candidate_profiles_public", "candidate_profiles", ["is_public"]
    )
    op.create_index(
        "idx_candidate_profiles_vibe_score", "candidate_profiles", ["vibe_score"]
    )


def downgrade() -> None:
    op.drop_index("idx_candidate_profiles_vibe_score", table_name="candidate_profiles")
    op.drop_index("idx_candidate_profiles_public", table_name="candidate_profiles")
    op.drop_column("candidate_profiles", "skills")
    op.drop_constraint(
        "uq_candidate_profiles_slug", "candidate_profiles", type_="unique"
    )
    op.drop_column("candidate_profiles", "slug")
