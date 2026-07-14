from datetime import datetime
from typing import ClassVar, Literal

from sqlalchemy import Column, DateTime, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Index, SQLModel


class UserBase(SQLModel):
    username: str = Field(max_length=32)
    first_name: str = Field(max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=70)
    avatar_url: str
    status: str = "online"


class User(UserBase, table=True):
    __tablename__: ClassVar[str] = "users"
    __table_args__ = (UniqueConstraint("username", name="uq_users_username"),)

    id: int | None = Field(default=None, primary_key=True)
    password_hash: str
    created_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
    updated_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={
            "server_default": func.now(),
            "onupdate": func.now(),
            "nullable": False,
        },
    )
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime)


class UserPublic(UserBase):
    id: int


class UserCreate(SQLModel):
    username: str = Field(max_length=32)
    password: str
    first_name: str = Field(max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=70)


class UserProfileUpdate(SQLModel):
    first_name: str | None = Field(default=None, max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=70)


class UserUpdate(UserBase):
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    status: str | None = None
    password_hash: str | None = None
    deleted_at: datetime | None = None


class Contact(SQLModel, table=True):
    __tablename__: ClassVar[str] = "contacts"

    owner_user_id: int = Field(
        foreign_key="users.id",
        primary_key=True,
        ondelete="CASCADE",
    )
    contact_user_id: int = Field(
        foreign_key="users.id",
        primary_key=True,
        ondelete="CASCADE",
    )
    created_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )


class UserBlock(SQLModel, table=True):
    __tablename__: ClassVar[str] = "user_blocks"

    blocker_user_id: int = Field(
        foreign_key="users.id",
        primary_key=True,
        ondelete="CASCADE",
    )
    blocked_user_id: int = Field(
        foreign_key="users.id",
        primary_key=True,
        ondelete="CASCADE",
    )
    created_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )


class LoginRequest(SQLModel):
    username: str
    password: str


class ChatBase(SQLModel):
    type: str = Field(max_length=32)
    title: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = None
    last_message_id: int | None = None
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime)


class Chat(ChatBase, table=True):
    __tablename__: ClassVar[str] = "chats"

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
    updated_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={
            "server_default": func.now(),
            "onupdate": func.now(),
            "nullable": False,
        },
    )


class ChatPublic(ChatBase):
    id: int
    created_at: datetime
    updated_at: datetime


class ChatCreate(ChatBase):
    pass


class GroupCreate(SQLModel):
    title: str = Field(max_length=128)
    description: str | None = Field(default=None, max_length=255)
    member_ids: list[int] = Field(default_factory=list)


class ChatUpdate(ChatBase):
    type: str | None = None
    title: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    last_message_id: int | None = None
    deleted_at: datetime | None = None


class ChatParticipantBase(SQLModel):
    chat_id: int = Field(foreign_key="chats.id", ondelete="CASCADE")
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    added_by: int | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="SET NULL",
    )
    role: str = Field(default="member", max_length=20)
    last_read_message_id: int | None = None
    last_read_at: datetime | None = Field(default=None, sa_type=DateTime)
    muted_until: datetime | None = Field(default=None, sa_type=DateTime)
    is_pinned: bool = False
    pinned_order: int | None = None
    is_archived: bool = False


class ChatParticipant(ChatParticipantBase, table=True):
    __tablename__: ClassVar[str] = "chat_participants"
    __table_args__ = (
        Index(
            "uq_chat_participants_active_chat_user",
            "chat_id",
            "user_id",
            unique=True,
            postgresql_where=text("left_at IS NULL"),
        ),
        Index(
            "ix_chat_participants_active_user_chat",
            "user_id",
            "chat_id",
            postgresql_where=text("left_at IS NULL"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    cleared_at: datetime | None = None
    joined_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
    left_at: datetime | None = Field(default=None, sa_type=DateTime)
    admin_permissions: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, server_default=text("'{}'::jsonb"), nullable=False),
    )
    member_permissions: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, server_default=text("'{}'::jsonb"), nullable=False),
    )
    promoted_by: int | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="SET NULL",
    )
    promoted_at: datetime | None = Field(default=None, sa_type=DateTime)


class ChatParticipantPublic(ChatParticipantBase):
    id: int
    joined_at: datetime
    left_at: datetime | None = None


class ChatParticipantCreate(ChatParticipantBase):
    pass


class ChatParticipantUpdate(ChatParticipantBase):
    chat_id: int | None = None
    user_id: int | None = None
    added_by: int | None = None
    role: str | None = None
    last_read_message_id: int | None = None
    last_read_at: datetime | None = None
    muted_until: datetime | None = None
    is_pinned: bool | None = None
    pinned_order: int | None = None
    is_archived: bool | None = None
    left_at: datetime | None = None


class MessageBase(SQLModel):
    chat_id: int = Field(foreign_key="chats.id", ondelete="CASCADE")
    sender_id: int | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="SET NULL",
    )
    content: str | None = None
    message_type: str = Field(default="text", max_length=20)
    reply_to_message_id: int | None = Field(
        default=None,
        foreign_key="messages.id",
        ondelete="SET NULL",
    )
    metadata_: dict = Field(
        default_factory=dict,
        alias="metadata",
        sa_column=Column(
            "metadata",
            JSONB,
            server_default=text("'{}'::jsonb"),
            nullable=False,
        ),
    )


class Message(MessageBase, table=True):
    __tablename__: ClassVar[str] = "messages"
    __table_args__ = (
        Index("ix_messages_chat_id_created_at", "chat_id", "created_at"),
        Index(
            "ix_messages_active_chat_id",
            "chat_id",
            "id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
    updated_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={
            "server_default": func.now(),
            "onupdate": func.now(),
            "nullable": False,
        },
    )
    edited_at: datetime | None = Field(default=None, sa_type=DateTime)
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime)
    deleted_by: int | None = Field(
        default=None, foreign_key="users.id", ondelete="SET NULL"
    )
    pinned_at: datetime | None = Field(default=None, sa_type=DateTime)
    pinned_by: int | None = Field(
        default=None, foreign_key="users.id", ondelete="SET NULL"
    )


class ChatListItem(SQLModel):
    id: int
    type: str
    title: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    display_title: str
    display_avatar_url: str = "/favicon.svg"

    # Direct-chat-only
    other_user_id: int | None = None
    is_blocked_by_other: bool = False
    # Group-chat-only
    member_ids: list[int] = Field(default_factory=list)
    member_count: int = 0
    current_user_role: str | None = None

    last_message_id: int | None = None
    last_message_created_at: datetime | None = None
    last_message_text: str | None = None
    last_message_sender_id: int | None = None
    unread_count: int = 0
    current_last_read_message_id: int | None = None
    other_last_read_message_id: int | None = None
    other_last_read_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_pinned: bool = False
    pinned_order: int | None = None


class DirectMessageCreate(SQLModel):
    recipient_id: int
    content: str = Field(min_length=1, max_length=4000)


class MessageCreate(SQLModel):
    content: str = Field(min_length=1, max_length=4000)
    reply_to_message_id: int | None = None


class ChatReadRequest(SQLModel):
    last_read_message_id: int


class ChatSettingsUpdate(SQLModel):
    is_pinned: bool | None = None
    is_archived: bool | None = None
    muted_until: datetime | None = None


class ChatDeleteRequest(SQLModel):
    delete_messages_for_everyone: bool = False


class PinnedChatOrderUpdate(SQLModel):
    chat_ids: list[int]


class PinnedChatOrderResponse(SQLModel):
    ok: bool
    chat_ids: list[int]


class AddGroupMembers(SQLModel):
    member_ids: list[int]


class ChatMemberPublic(SQLModel):
    user_id: int
    username: str
    first_name: str
    last_name: str | None = None
    bio: str | None = None
    avatar_url: str
    status: str
    role: str
    joined_at: datetime | None = None
    added_by: int | None = None
    member_permissions: dict = Field(default_factory=dict)


class ChatMemberPermissions(SQLModel, table=True):
    __tablename__: ClassVar[str] = "chat_member_permissions"
    chat_id: int = Field(
        primary_key=True,
        foreign_key="chats.id",
        ondelete="CASCADE",
    )
    permissions: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, server_default=text("'{}'::jsonb"), nullable=False),
    )


class MessageUserState(SQLModel, table=True):
    __tablename__: ClassVar[str] = "message_user_states"

    message_id: int = Field(
        foreign_key="messages.id", primary_key=True, ondelete="CASCADE"
    )
    user_id: int = Field(foreign_key="users.id", primary_key=True, ondelete="CASCADE")

    deleted_at: datetime | None = None
    pinned_at: datetime | None = None


class MessagePinRequest(SQLModel):
    scope: Literal["me", "chat"]


class MessageDeleteRequest(SQLModel):
    scope: Literal["me", "chat"]


class MessageEditRequest(SQLModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageReplyPreview(SQLModel):
    id: int
    sender_id: int | None = None
    sender_username: str | None = None
    content: str | None = None
    message_type: str


class MessagePublic(MessageBase):
    id: int
    chat_id: int
    sender_username: str | None = None
    sender_avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    edited_at: datetime | None = None
    deleted_at: datetime | None = None

    # Shared/chat-level pin
    pinned_at: datetime | None = None
    pinned_by: int | None = None

    # Current-user personal pin
    is_pinned_for_me: bool = False

    reply_to: MessageReplyPreview | None = None


class DirectMessageResponse(SQLModel):
    chat: ChatListItem
    message: MessagePublic
