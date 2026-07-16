"""keep cleared direct chats visible

Revision ID: 2026_07_15_0002
Revises: 2026_07_15_0001
Create Date: 2026-07-15 00:02:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2026_07_15_0002"
down_revision: Union[str, None] = "2026_07_15_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_participants",
        sa.Column(
            "show_when_empty",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_participants", "show_when_empty")
