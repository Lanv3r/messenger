"""make chat avatar url nullable

Revision ID: 202606130002
Revises: 202606130001
Create Date: 2026-06-13 00:02:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606130002"
down_revision: Union[str, None] = "202606130001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "chats",
        "avatar_url",
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE chats SET avatar_url = '' WHERE avatar_url IS NULL")
    op.alter_column(
        "chats",
        "avatar_url",
        existing_type=sa.String(),
        nullable=False,
    )
