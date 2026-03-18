"""Add file upload support and assessment file patterns

Revision ID: 0007
Revises: 0006
Create Date: 2024-12-29

Adds:
- file_patterns column to assessments for custom file filtering
- submission_type, uploaded_files_path, uploaded_file_count to submissions
- Makes github_repo_url nullable for file upload submissions
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add file_patterns to assessments
    op.add_column(
        "assessments",
        sa.Column("file_patterns", postgresql.ARRAY(sa.String()), nullable=True),
    )

    # Add submission_type column with default 'github' for existing rows
    op.add_column(
        "submissions",
        sa.Column(
            "submission_type",
            sa.String(20),
            nullable=False,
            server_default="github",
        ),
    )

    # Add uploaded_files_path column
    op.add_column(
        "submissions",
        sa.Column("uploaded_files_path", sa.Text(), nullable=True),
    )

    # Add uploaded_file_count column
    op.add_column(
        "submissions",
        sa.Column("uploaded_file_count", sa.Integer(), nullable=True),
    )

    # Make github_repo_url nullable (for file upload submissions)
    op.alter_column(
        "submissions",
        "github_repo_url",
        existing_type=sa.Text(),
        nullable=True,
    )


def downgrade() -> None:
    # Make github_repo_url required again
    # First, update any NULL values to empty string (or fail if there are any)
    op.execute(
        "UPDATE submissions SET github_repo_url = '' WHERE github_repo_url IS NULL"
    )
    op.alter_column(
        "submissions",
        "github_repo_url",
        existing_type=sa.Text(),
        nullable=False,
    )

    # Drop new columns
    op.drop_column("submissions", "uploaded_file_count")
    op.drop_column("submissions", "uploaded_files_path")
    op.drop_column("submissions", "submission_type")
    op.drop_column("assessments", "file_patterns")
