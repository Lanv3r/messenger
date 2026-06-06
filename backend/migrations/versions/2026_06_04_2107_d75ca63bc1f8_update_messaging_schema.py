"""update messaging schema

Revision ID: d75ca63bc1f8
Revises: 0001
Create Date: 2026-06-04 21:07:14.751747+00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d75ca63bc1f8"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "user_id", new_column_name="id")
    op.alter_column("users", "password", new_column_name="password_hash")
    op.alter_column(
        "users",
        "username",
        existing_type=sa.VARCHAR(length=100),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.add_column("users", sa.Column("first_name", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(length=70), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("status", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE users SET first_name = '', avatar_url = '', status = 'online'")
    op.alter_column("users", "first_name", nullable=False)
    op.alter_column("users", "avatar_url", nullable=False)
    op.alter_column("users", "status", nullable=False)

    op.create_table(
        "conversations",
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(), nullable=False),
        sa.Column("last_message_id", sa.Integer(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.execute(
        """
        INSERT INTO conversations (type, title, avatar_url)
        SELECT 'room', room, ''
        FROM messages
        GROUP BY room
        """
    )

    op.add_column("messages", sa.Column("conversation_id", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("sender_id", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("content", sa.String(), nullable=True))
    op.add_column(
        "messages",
        sa.Column(
            "message_type",
            sa.String(length=20),
            server_default=sa.text("'text'"),
            nullable=False,
        ),
    )
    op.add_column("messages", sa.Column("reply_to_message_id", sa.Integer(), nullable=True))
    op.add_column(
        "messages",
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "messages",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column("messages", sa.Column("edited_at", sa.DateTime(), nullable=True))
    op.add_column("messages", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column(
        "messages",
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute(
        """
        UPDATE messages
        SET conversation_id = conversations.id,
            content = messages.body
        FROM conversations
        WHERE conversations.title = messages.room
        """
    )
    op.alter_column("messages", "conversation_id", nullable=False)
    op.create_foreign_key(
        "fk_messages_conversation_id_conversations",
        "messages",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_messages_sender_id_users",
        "messages",
        "users",
        ["sender_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_messages_reply_to_message_id_messages",
        "messages",
        "messages",
        ["reply_to_message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("messages", "room")
    op.drop_column("messages", "sender")
    op.drop_column("messages", "body")

    op.create_table(
        "conversation_participants",
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("last_read_message_id", sa.Integer(), nullable=True),
        sa.Column("last_read_at", sa.DateTime(), nullable=True),
        sa.Column("muted_until", sa.DateTime(), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("joined_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("left_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name="fk_conversation_participants_conversation_id_conversations",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_conversation_participants_user_id_users",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "conversation_id",
            "user_id",
            name="uq_conversation_participants_conversation_id_user_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("conversation_participants")
    op.add_column("messages", sa.Column("body", sa.String(length=1000), nullable=True))
    op.add_column("messages", sa.Column("sender", sa.String(length=100), nullable=True))
    op.add_column("messages", sa.Column("room", sa.String(length=50), nullable=True))
    op.execute(
        """
        UPDATE messages
        SET body = messages.content,
            sender = COALESCE(users.username, ''),
            room = conversations.title
        FROM conversations
        LEFT JOIN users ON users.id = messages.sender_id
        WHERE conversations.id = messages.conversation_id
        """
    )
    op.alter_column("messages", "body", nullable=False)
    op.alter_column("messages", "sender", nullable=False)
    op.alter_column("messages", "room", nullable=False)
    op.drop_constraint("fk_messages_reply_to_message_id_messages", "messages", type_="foreignkey")
    op.drop_constraint("fk_messages_sender_id_users", "messages", type_="foreignkey")
    op.drop_constraint("fk_messages_conversation_id_conversations", "messages", type_="foreignkey")
    op.drop_column("messages", "is_pinned")
    op.drop_column("messages", "deleted_at")
    op.drop_column("messages", "edited_at")
    op.drop_column("messages", "updated_at")
    op.drop_column("messages", "metadata")
    op.drop_column("messages", "reply_to_message_id")
    op.drop_column("messages", "message_type")
    op.drop_column("messages", "content")
    op.drop_column("messages", "sender_id")
    op.drop_column("messages", "conversation_id")
    op.drop_table("conversations")

    op.add_column("users", sa.Column("password", sa.String(length=255), nullable=True))
    op.execute("UPDATE users SET password = password_hash")
    op.alter_column("users", "password", nullable=False)
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "updated_at")
    op.drop_column("users", "created_at")
    op.drop_column("users", "status")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "bio")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
    op.drop_column("users", "password_hash")
    op.alter_column(
        "users",
        "username",
        existing_type=sa.String(length=32),
        type_=sa.VARCHAR(length=100),
        existing_nullable=False,
    )
    op.alter_column("users", "id", new_column_name="user_id")
