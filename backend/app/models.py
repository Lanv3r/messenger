from datetime import datetime
from typing import ClassVar

from sqlalchemy import Column, DateTime, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


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


class ConversationBase(SQLModel):
    type: str = Field(max_length=32)
    title: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=255)
    avatar_url: str
    last_message_id: int | None = None
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime)


class Conversation(ConversationBase, table=True):
    __tablename__: ClassVar[str] = "conversations"

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


class ConversationPublic(ConversationBase):
    id: int
    created_at: datetime
    updated_at: datetime


class ConversationCreate(ConversationBase):
    pass


class ConversationUpdate(ConversationBase):
    type: str | None = None
    title: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    last_message_id: int | None = None
    deleted_at: datetime | None = None


class ConversationParticipantBase(SQLModel):
    conversation_id: int = Field(foreign_key="conversations.id", ondelete="CASCADE")
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    role: str = Field(default="member", max_length=20)
    last_read_message_id: int | None = None
    last_read_at: datetime | None = Field(default=None, sa_type=DateTime)
    muted_until: datetime | None = Field(default=None, sa_type=DateTime)
    is_pinned: bool = False
    is_archived: bool = False


class ConversationParticipant(ConversationParticipantBase, table=True):
    __tablename__: ClassVar[str] = "conversation_participants"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "user_id",
            name="uq_conversation_participants_conversation_id_user_id",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    joined_at: datetime | None = Field(
        default=None,
        sa_type=DateTime,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
    left_at: datetime | None = Field(default=None, sa_type=DateTime)


class ConversationParticipantPublic(ConversationParticipantBase):
    id: int
    joined_at: datetime
    left_at: datetime | None = None


class ConversationParticipantCreate(ConversationParticipantBase):
    pass


class ConversationParticipantUpdate(ConversationParticipantBase):
    conversation_id: int | None = None
    user_id: int | None = None
    role: str | None = None
    last_read_message_id: int | None = None
    last_read_at: datetime | None = None
    muted_until: datetime | None = None
    is_pinned: bool | None = None
    is_archived: bool | None = None
    left_at: datetime | None = None


class MessageBase(SQLModel):
    conversation_id: int = Field(foreign_key="conversations.id", ondelete="CASCADE")
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
    conversation_id: int | None = None
    sender_id: int | None = None
    content: str | None = None
    message_type: str | None = None
    reply_to_message_id: int | None = None
    metadata_: dict | None = None
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    is_pinned: bool | None = None


class ConversationListItem(SQLModel):
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
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DirectMessageCreate(SQLModel):
    recipient_id: int
    content: str


class DirectMessageResponse(SQLModel):
    conversation: ConversationListItem
    message: MessagePublic
