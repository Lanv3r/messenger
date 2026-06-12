from datetime import datetime
from typing import ClassVar

from sqlalchemy import Column, DateTime, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Index, SQLModel


class UserBase(SQLModel):
    username: str = Field(max_length=32, unique=True)
    first_name: str = Field(max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=70)
    avatar_url: str
    status: str = "online"


class User(UserBase, table=True):
    __tablename__: ClassVar[str] = "users"

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


class UserCreate(UserBase):
    password: str


class UserUpdate(UserBase):
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    status: str | None = None
    password_hash: str | None = None
    deleted_at: datetime | None = None


class UserProfileUpdate(SQLModel):
    first_name: str | None = Field(default=None, max_length=64)
    last_name: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=70)
    avatar_url: str | None = None


class LoginRequest(SQLModel):
    username: str
    password: str


class ChatBase(SQLModel):
    type: str = Field(max_length=32)
    title: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=255)
    avatar_url: str
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
    role: str = Field(default="member", max_length=20)
    last_read_message_id: int | None = None
    last_read_at: datetime | None = Field(default=None, sa_type=DateTime)
    muted_until: datetime | None = Field(default=None, sa_type=DateTime)
    is_pinned: bool = False
    is_archived: bool = False


class ChatParticipant(ChatParticipantBase, table=True):
    __tablename__: ClassVar[str] = "chat_participants"
    __table_args__ = (
        UniqueConstraint(
            "chat_id",
            "user_id",
            name="uq_chat_participants_chat_id_user_id",
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


class ChatParticipantPublic(ChatParticipantBase):
    id: int
    joined_at: datetime
    left_at: datetime | None = None


class ChatParticipantCreate(ChatParticipantBase):
    pass


class ChatParticipantUpdate(ChatParticipantBase):
    chat_id: int | None = None
    user_id: int | None = None
    role: str | None = None
    last_read_message_id: int | None = None
    last_read_at: datetime | None = None
    muted_until: datetime | None = None
    is_pinned: bool | None = None
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
    __table_args__ = (Index("ix_messages_chat_id_created_at", "chat_id", "created_at"),)

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
    is_pinned: bool = False


class MessagePublic(MessageBase):
    id: int
    sender_username: str | None = None
    sender_avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    is_pinned: bool


class MessageCreate(MessageBase):
    pass


class MessageUpdate(MessageBase):
    chat_id: int | None = None
    sender_id: int | None = None
    content: str | None = None
    message_type: str | None = None
    reply_to_message_id: int | None = None
    metadata_: dict | None = None
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    is_pinned: bool | None = None


class ChatListItem(SQLModel):
    id: int
    type: str
    title: str | None = None
    description: str | None = None
    avatar_url: str
    display_title: str
    display_avatar_url: str
    other_user_id: int | None = None
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


class DirectMessageCreate(SQLModel):
    recipient_id: int
    content: str


class DirectMessageResponse(SQLModel):
    chat: ChatListItem
    message: MessagePublic


class ChatReadRequest(SQLModel):
    last_read_message_id: int


class ChatSettingsUpdate(SQLModel):
    is_pinned: bool | None = None
    is_archived: bool | None = None
    muted_until: datetime | None = None


class MessageDeletion(SQLModel, table=True):
    __tablename__: ClassVar[str] = "message_deletions"
    __table_args__ = (UniqueConstraint("message_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    message_id: int = Field(foreign_key="messages.id", ondelete="CASCADE")
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    deleted_at: datetime | None = None
