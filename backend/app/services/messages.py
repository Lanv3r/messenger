from fastapi import HTTPException

from app.models import Message, MessagePublic, MessageUserState, User


def to_message_public(
    message: Message,
    sender: User | None = None,
    sender_username: str | None = None,
    sender_avatar_url: str | None = None,
    message_user_state: MessageUserState | None = None,
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
        is_pinned_for_me=message_user_state is not None
        and message_user_state.pinned_at is not None,
    )
