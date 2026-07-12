"""add pinned chat order

Revision ID: 2026_07_12_0001
Revises: baf356404891
Create Date: 2026-07-12 00:01:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2026_07_12_0001"
down_revision: Union[str, None] = "baf356404891"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_participants",
        sa.Column("pinned_order", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id
                    ORDER BY id
                ) AS pinned_order
            FROM chat_participants
            WHERE is_pinned = true
              AND left_at IS NULL
        )
        UPDATE chat_participants
        SET pinned_order = ranked.pinned_order
        FROM ranked
        WHERE chat_participants.id = ranked.id
        """
    )


def downgrade() -> None:
    op.drop_column("chat_participants", "pinned_order")
