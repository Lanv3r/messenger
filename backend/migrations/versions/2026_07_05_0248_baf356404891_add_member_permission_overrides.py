"""add member permission overrides

Revision ID: baf356404891
Revises: 97a7d95e1abe
Create Date: 2026-07-05 02:48:27.780351+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "baf356404891"
down_revision: Union[str, None] = "97a7d95e1abe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_participants",
        sa.Column(
            "member_permissions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_participants", "member_permissions")
