from datetime import datetime

from app.models import (
    ChatParticipant,
    Message,
    MessagePublic,
    MessageReplyPreview,
    MessageUserState,
    User,
)
from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, col, exists, select

DELETED_MESSAGE_PREVIEW_CONTENT = "message deleted"
DELETED_MESSAGE_PREVIEW_TYPE = "deleted"
VOICE_MESSAGE_PREVIEW_CONTENT = "Voice message"
FILE_MESSAGE_PREVIEW_LABELS = {
    "album": "Attachments",
    "audio": "Audio file",
    "file": "File",
    "image": "Photo",
    "video": "Video",
}


def message_is_visible_to_user(
    user_id: int,
    cleared_at: datetime | None = None,
) -> ColumnElement[bool]:
    conditions: list[ColumnElement[bool]] = [
        ~exists().where(
            col(MessageUserState.message_id) == col(Message.id),
            col(MessageUserState.user_id) == user_id,
            col(MessageUserState.deleted_at).is_not(None),
        )
    ]

    if cleared_at is not None:
        conditions.append(col(Message.created_at) > cleared_at)

    return and_(*conditions)


def get_uploaded_file_message_type_and_permission(content_type: str) -> tuple[str, str]:
    if content_type.startswith("image/"):
        return "image", "send_photos"
    if content_type.startswith("video/"):
        return "video", "send_video_files"
    if content_type.startswith("audio/"):
        return "audio", "send_music"

    return "file", "send_files"


def get_message_preview_text(message: Message) -> str | None:
    content = message.content.strip() if message.content else None
    if content:
        return content

    attachments = message.metadata_.get("attachments")
    if isinstance(attachments, list) and attachments:
        attachment_types = {
            attachment.get("message_type")
            for attachment in attachments
            if isinstance(attachment, dict)
        }
        if attachment_types == {"image"}:
            return f"{len(attachments)} photos"

        return f"{len(attachments)} attachments"

    if message.message_type == "voice":
        return VOICE_MESSAGE_PREVIEW_CONTENT

    if message.message_type in FILE_MESSAGE_PREVIEW_LABELS:
        original_name = message.metadata_.get("original_name")
        label = FILE_MESSAGE_PREVIEW_LABELS[message.message_type]
        return f"{label}: {original_name}" if original_name else label

    return message.message_type if message.message_type != "text" else None


def to_message_public(
    message: Message,
    sender: User | None = None,
    sender_username: str | None = None,
    sender_avatar_url: str | None = None,
    message_user_state: MessageUserState | None = None,
    reply_to: MessageReplyPreview | None = None,
) -> MessagePublic:
    if message.id is None or message.created_at is None:
        raise HTTPException(
            status_code=500,
            detail="Message was not persisted correctly",
        )

    return MessagePublic(
        id=message.id,
        chat_id=message.chat_id,
        sender_id=message.sender_id,
        sender_username=sender.username if sender else sender_username,
        sender_avatar_url=sender.avatar_url if sender else sender_avatar_url,
        content=message.content,
        message_type=message.message_type,
        reply_to_message_id=message.reply_to_message_id,
        metadata=message.metadata_,
        created_at=message.created_at,
        updated_at=message.updated_at,
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
        pinned_at=message.pinned_at,
        pinned_by=message.pinned_by,
        read_by_anyone=message.read_by_anyone,
        is_pinned_for_me=message_user_state is not None
        and message_user_state.pinned_at is not None,
        reply_to=reply_to,
    )


def build_message_reply_preview(
    session: Session,
    message: Message,
    viewer_id: int | None = None,
) -> MessageReplyPreview | None:
    if message.reply_to_message_id is None:
        return None

    reply_target_statement = select(Message).where(
        col(Message.id) == message.reply_to_message_id,
        col(Message.chat_id) == message.chat_id,
    )

    reply_target = session.exec(reply_target_statement).first()
    if reply_target is None or reply_target.id is None:
        return MessageReplyPreview(
            id=message.reply_to_message_id,
            content=DELETED_MESSAGE_PREVIEW_CONTENT,
            message_type=DELETED_MESSAGE_PREVIEW_TYPE,
        )

    message_user_state = (
        session.get(MessageUserState, (reply_target.id, viewer_id))
        if viewer_id is not None
        else None
    )
    viewer_participant = (
        session.exec(
            select(ChatParticipant).where(
                col(ChatParticipant.chat_id) == message.chat_id,
                col(ChatParticipant.user_id) == viewer_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).first()
        if viewer_id is not None
        else None
    )
    if reply_target.deleted_at is not None or (
        message_user_state is not None and message_user_state.deleted_at is not None
    ) or (
        viewer_participant is not None
        and viewer_participant.cleared_at is not None
        and (
            reply_target.created_at is None
            or reply_target.created_at <= viewer_participant.cleared_at
        )
    ):
        return MessageReplyPreview(
            id=reply_target.id,
            content=DELETED_MESSAGE_PREVIEW_CONTENT,
            message_type=DELETED_MESSAGE_PREVIEW_TYPE,
        )

    sender = (
        session.get(User, reply_target.sender_id)
        if reply_target.sender_id is not None
        else None
    )

    return MessageReplyPreview(
        id=reply_target.id,
        sender_id=reply_target.sender_id,
        sender_username=sender.username if sender else None,
        content=reply_target.content,
        message_type=reply_target.message_type,
    )


def get_reply_target(
    session: Session,
    chat_id: int,
    user_id: int,
    reply_to_message_id: int | None,
) -> Message | None:
    if reply_to_message_id is None:
        return None

    participant = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.user_id) == user_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).first()
    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    reply_target = session.exec(
        select(Message).where(
            col(Message.id) == reply_to_message_id,
            col(Message.chat_id) == chat_id,
            col(Message.deleted_at).is_(None),
            message_is_visible_to_user(user_id, participant.cleared_at),
        )
    ).first()

    if reply_target is None:
        raise HTTPException(status_code=400, detail="Reply target not found")

    return reply_target
