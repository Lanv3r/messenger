"""move avatar storage references to S3 keys

Revision ID: 2026_07_20_0001
Revises: 2026_07_16_0001
Create Date: 2026-07-20 00:01:00+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2026_07_20_0001"
down_revision: Union[str, None] = "2026_07_16_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_storage_key", sa.String(), nullable=True),
    )
    op.add_column(
        "chats",
        sa.Column("avatar_storage_key", sa.String(), nullable=True),
    )
    op.drop_column("users", "avatar_url")
    op.drop_column("chats", "avatar_url")


def downgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))
    op.execute("UPDATE users SET avatar_url = ''")
    op.alter_column("users", "avatar_url", nullable=False)
    op.add_column("chats", sa.Column("avatar_url", sa.String(), nullable=True))
    op.drop_column("chats", "avatar_storage_key")
    op.drop_column("users", "avatar_storage_key")
