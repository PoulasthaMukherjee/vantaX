"""Add llm_budget_cents to organizations

Revision ID: 0002
Revises: 0001
Create Date: 2024-12-10

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add llm_budget_cents column to organizations
    # NULL means unlimited budget
    op.add_column(
        "organizations", sa.Column("llm_budget_cents", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("organizations", "llm_budget_cents")
