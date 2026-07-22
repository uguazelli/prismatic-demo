"""Track Prismatic webhook delivery attempts.

Revision ID: 20260722_0002
Revises: 20260721_0001
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260722_0002"
down_revision: str | None = "20260721_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "integration_events", sa.Column("last_attempted_at", sa.DateTime(timezone=True))
    )
    op.add_column(
        "integration_events", sa.Column("next_attempt_at", sa.DateTime(timezone=True))
    )
    op.add_column("integration_events", sa.Column("last_error", sa.Text()))
    op.create_index(
        "ix_integration_events_next_attempt_at",
        "integration_events",
        ["next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_integration_events_next_attempt_at", table_name="integration_events")
    op.drop_column("integration_events", "last_error")
    op.drop_column("integration_events", "next_attempt_at")
    op.drop_column("integration_events", "last_attempted_at")
