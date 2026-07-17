"""add group message read indicator

Revision ID: 2026_07_16_0001
Revises: 2026_07_15_0002
Create Date: 2026-07-16 00:01:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2026_07_16_0001"
down_revision: Union[str, None] = "2026_07_15_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "read_by_anyone",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE messages AS message
        SET read_by_anyone = true
        FROM chats AS chat
        WHERE chat.id = message.chat_id
          AND chat.type = 'group'
          AND message.sender_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM chat_participants AS participant
              WHERE participant.chat_id = message.chat_id
                AND participant.user_id <> message.sender_id
                AND participant.last_read_message_id >= message.id
          )
        """
    )


def downgrade() -> None:
    op.drop_column("messages", "read_by_anyone")
