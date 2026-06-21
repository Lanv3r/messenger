"""add chat lookup indexes

Revision ID: 45534c360b73
Revises: 920334026cd8
Create Date: 2026-06-21 18:34:08.278651+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '45534c360b73'
down_revision: Union[str, None] = '920334026cd8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key")
    op.create_index(
        "ix_chat_participants_active_user_chat",
        "chat_participants",
        ["user_id", "chat_id"],
        unique=False,
        postgresql_where=sa.text("left_at IS NULL"),
    )
    op.create_index(
        "ix_messages_active_chat_id",
        "messages",
        ["chat_id", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_messages_active_chat_id", table_name="messages")
    op.drop_index(
        "ix_chat_participants_active_user_chat",
        table_name="chat_participants",
    )
    op.create_unique_constraint("users_username_key", "users", ["username"])
