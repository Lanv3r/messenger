"""add chat member tags

Revision ID: 2026_07_15_0001
Revises: 2026_07_13_0002
Create Date: 2026-07-15 00:01:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "2026_07_15_0001"
down_revision: Union[str, None] = "2026_07_13_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_participants",
        sa.Column(
            "member_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_participants", "member_tags")
