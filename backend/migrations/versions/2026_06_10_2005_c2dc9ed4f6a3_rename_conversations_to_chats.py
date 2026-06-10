"""rename conversations to chats

Revision ID: c2dc9ed4f6a3
Revises: d75ca63bc1f8
Create Date: 2026-06-10 20:05:23.675549+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2dc9ed4f6a3'
down_revision: Union[str, None] = 'd75ca63bc1f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("conversations", "chats")
    op.rename_table("conversation_participants", "chat_participants")
    op.execute("ALTER TABLE chats RENAME CONSTRAINT conversations_pkey TO chats_pkey")
    op.execute(
        "ALTER TABLE chat_participants "
        "RENAME CONSTRAINT conversation_participants_pkey "
        "TO chat_participants_pkey"
    )
    op.execute(
        "ALTER TABLE chat_participants "
        "RENAME CONSTRAINT fk_conversation_participants_user_id_users "
        "TO fk_chat_participants_user_id_users"
    )

    op.drop_constraint(
        "fk_messages_conversation_id_conversations",
        "messages",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_conversation_participants_conversation_id_conversations",
        "chat_participants",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_conversation_participants_conversation_id_user_id",
        "chat_participants",
        type_="unique",
    )

    op.alter_column(
        "messages",
        "conversation_id",
        new_column_name="chat_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.alter_column(
        "chat_participants",
        "conversation_id",
        new_column_name="chat_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )

    op.create_foreign_key(
        "fk_messages_chat_id_chats",
        "messages",
        "chats",
        ["chat_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_chat_participants_chat_id_chats",
        "chat_participants",
        "chats",
        ["chat_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_chat_participants_chat_id_user_id",
        "chat_participants",
        ["chat_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_chat_participants_chat_id_user_id",
        "chat_participants",
        type_="unique",
    )
    op.drop_constraint(
        "fk_chat_participants_chat_id_chats",
        "chat_participants",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_messages_chat_id_chats",
        "messages",
        type_="foreignkey",
    )

    op.alter_column(
        "chat_participants",
        "chat_id",
        new_column_name="conversation_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.alter_column(
        "messages",
        "chat_id",
        new_column_name="conversation_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )

    op.rename_table("chat_participants", "conversation_participants")
    op.rename_table("chats", "conversations")
    op.execute("ALTER TABLE conversations RENAME CONSTRAINT chats_pkey TO conversations_pkey")
    op.execute(
        "ALTER TABLE conversation_participants "
        "RENAME CONSTRAINT chat_participants_pkey "
        "TO conversation_participants_pkey"
    )
    op.execute(
        "ALTER TABLE conversation_participants "
        "RENAME CONSTRAINT fk_chat_participants_user_id_users "
        "TO fk_conversation_participants_user_id_users"
    )

    op.create_foreign_key(
        "fk_messages_conversation_id_conversations",
        "messages",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_conversation_participants_conversation_id_conversations",
        "conversation_participants",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_conversation_participants_conversation_id_user_id",
        "conversation_participants",
        ["conversation_id", "user_id"],
    )
