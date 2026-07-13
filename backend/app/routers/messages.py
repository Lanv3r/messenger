from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, TypedDict, cast
from uuid import uuid4

from app.db import SessionDep
from app.dependencies import get_current_user
from app.models import (
    Chat,
    ChatListItem,
    ChatParticipant,
    DirectMessageCreate,
    DirectMessageResponse,
    Message,
    MessageCreate,
    MessageDeleteRequest,
    MessageEditRequest,
    MessagePinRequest,
    MessagePublic,
    MessageUserState,
    User,
)
from app.rate_limit import message_rate_limiter, upload_rate_limiter
from app.services.chats import (
    assert_direct_chat_message_allowed,
    require_active_participant,
    require_chat_permission,
)
from app.services.messages import (
    build_message_reply_preview,
    get_reply_target,
    get_uploaded_file_message_type_and_permission,
    to_message_public,
)
from app.services.users import assert_direct_message_allowed
from app.socket import sio
from app.upload_constants import (
    FILE_MESSAGE_ALLOWED_TYPES,
    FILE_MESSAGE_MAX_BYTES,
    FILE_UPLOAD_URL_PREFIX,
    FILE_UPLOADS_DIR,
    VOICE_MESSAGE_ALLOWED_TYPES,
    VOICE_MESSAGE_MAX_BYTES,
    VOICE_UPLOAD_URL_PREFIX,
    VOICE_UPLOADS_DIR,
)
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlmodel import col, exists, select

router = APIRouter(tags=["messages"])


class PreparedFileAttachment(TypedDict):
    file_bytes: bytes
    extension: str
    original_name: str
    mime_type: str
    message_type: str
    permission_name: str
    size_bytes: int


def require_visible_message(
    session: SessionDep,
    message_id: int,
    user_id: int,
) -> Message:
    message = session.get(Message, message_id)
    if message is None or message.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    require_active_participant(session, message.chat_id, user_id)

    message_user_state = session.get(MessageUserState, (message_id, user_id))
    if message_user_state is not None and message_user_state.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    return message


async def prepare_file_attachment(file: UploadFile) -> PreparedFileAttachment:
    content_type = file.content_type or ""
    base_content_type = content_type.split(";", 1)[0].strip().lower()
    extension = FILE_MESSAGE_ALLOWED_TYPES.get(base_content_type)
    if extension is None:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    message_type, permission_name = get_uploaded_file_message_type_and_permission(
        base_content_type
    )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(file_bytes) > FILE_MESSAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large")

    return {
        "file_bytes": file_bytes,
        "extension": extension,
        "original_name": Path(file.filename or "file").name or "file",
        "mime_type": content_type or base_content_type,
        "message_type": message_type,
        "permission_name": permission_name,
        "size_bytes": len(file_bytes),
    }


def save_prepared_file_attachment(
    prepared_attachment: PreparedFileAttachment,
) -> dict[str, object]:
    FILE_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{prepared_attachment['extension']}"
    upload_path = FILE_UPLOADS_DIR / filename
    upload_path.write_bytes(prepared_attachment["file_bytes"])

    return {
        "file_url": f"{FILE_UPLOAD_URL_PREFIX}/{filename}",
        "original_name": prepared_attachment["original_name"],
        "mime_type": prepared_attachment["mime_type"],
        "size_bytes": prepared_attachment["size_bytes"],
        "message_type": prepared_attachment["message_type"],
    }


def get_message_file_attachments(message: Message) -> list[dict[str, object]]:
    attachments = message.metadata_.get("attachments")
    if isinstance(attachments, list):
        return [
            dict(attachment)
            for attachment in attachments
            if isinstance(attachment, dict)
            and isinstance(attachment.get("file_url"), str)
        ]

    if isinstance(message.metadata_.get("file_url"), str):
        attachment = dict(message.metadata_)
        attachment.setdefault("message_type", message.message_type)
        return [attachment]

    return []


def build_file_message_metadata(
    attachments: list[dict[str, object]],
) -> tuple[str, dict[str, object]]:
    if len(attachments) == 1:
        message_type = attachments[0].get("message_type")
        return str(message_type) if message_type else "file", attachments[0]

    return "album", {"attachments": attachments}


def parse_file_caption(content: str | None) -> str | None:
    caption = content.strip() if content and content.strip() else None
    if caption is not None and len(caption) > 4000:
        raise HTTPException(status_code=400, detail="Caption is too long")

    return caption


@router.get(
    "/chats/{chat_id}/messages",
    response_model=list[MessagePublic],
)
def get_chat_messages(
    chat_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    require_active_participant(session, chat_id, current_user_id)

    messages = session.exec(
        select(Message)
        .where(
            col(Message.chat_id) == chat_id,
            col(Message.deleted_at).is_(None),
            ~exists().where(
                col(MessageUserState.message_id) == col(Message.id),
                col(MessageUserState.user_id) == current_user_id,
                col(MessageUserState.deleted_at).is_not(None),
            ),
        )
        .order_by(col(Message.created_at))
    ).all()
    sender_ids = {
        message.sender_id for message in messages if message.sender_id is not None
    }
    users = (
        session.exec(select(User).where(col(User.id).in_(sender_ids))).all()
        if sender_ids
        else []
    )
    users_by_id = {user.id: user for user in users}

    public_messages = []

    for message in messages:
        sender = users_by_id.get(message.sender_id)
        message_user_state = session.get(
            MessageUserState, (message.id, current_user_id)
        )
        reply_to = build_message_reply_preview(session, message, current_user_id)
        public_messages.append(
            to_message_public(
                message,
                sender,
                message_user_state=message_user_state,
                reply_to=reply_to,
            )
        )

    return public_messages


@router.get("/messages/{message_id}/copy-image")
def get_message_image_for_copy(
    message_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    attachment_index: Annotated[int | None, Query(ge=0)] = None,
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    message = require_visible_message(session, message_id, user_id)

    metadata = message.metadata_
    if attachment_index is not None:
        attachments = message.metadata_.get("attachments")
        if not isinstance(attachments, list):
            if attachment_index == 0 and message.message_type == "image":
                attachments = []
            else:
                raise HTTPException(status_code=404, detail="Image not found")
        if attachments and attachment_index >= len(attachments):
            raise HTTPException(status_code=404, detail="Image not found")

        if attachments:
            attachment_metadata = attachments[attachment_index]
            if not isinstance(attachment_metadata, dict):
                raise HTTPException(status_code=404, detail="Image not found")
            if attachment_metadata.get("message_type") != "image":
                raise HTTPException(status_code=400, detail="Message is not an image")

            metadata = attachment_metadata
    elif message.message_type != "image":
        raise HTTPException(status_code=400, detail="Message is not an image")

    file_url = metadata.get("file_url")
    if not isinstance(file_url, str) or not file_url.startswith(
        f"{FILE_UPLOAD_URL_PREFIX}/"
    ):
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = FILE_UPLOADS_DIR / Path(file_url).name
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    mime_type = metadata.get("mime_type")
    media_type = (
        mime_type.split(";", 1)[0].strip()
        if isinstance(mime_type, str) and mime_type.startswith("image/")
        else "image/png"
    )

    return FileResponse(image_path, media_type=media_type)


@router.post(
    "/messages/direct",
    response_model=DirectMessageResponse,
    dependencies=[Depends(message_rate_limiter)],
)
async def create_direct_message(
    payload: DirectMessageCreate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    sender_id = current_user.id
    if sender_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    recipient = session.get(User, payload.recipient_id)
    if recipient is None:
        raise HTTPException(status_code=401, detail="User not found")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    if payload.recipient_id == sender_id:
        raise HTTPException(
            status_code=403,
            detail="Can't start a direct chat with yourself",
        )

    assert_direct_message_allowed(session, sender_id, payload.recipient_id)

    participant_ids = [sender_id, payload.recipient_id]

    matching_chat_ids = (
        select(col(ChatParticipant.chat_id))
        .where(
            col(ChatParticipant.user_id).in_(participant_ids),
            col(ChatParticipant.left_at).is_(None),
        )
        .group_by(col(ChatParticipant.chat_id))
        .having(func.count(col(ChatParticipant.user_id)) == 2)
    )

    direct_chat = session.exec(
        select(Chat).where(
            col(Chat.type) == "direct",
            col(Chat.id).in_(matching_chat_ids),
        )
    ).first()

    if direct_chat is not None:
        raise HTTPException(
            status_code=409,
            detail="Chat already exists",
        )

    chat = Chat(
        type="direct",
    )

    session.add(chat)
    session.flush()

    if chat.id is None:
        raise HTTPException(
            status_code=500,
            detail="Chat was not created correctly",
        )

    session.add(
        ChatParticipant(
            chat_id=chat.id,
            user_id=sender_id,
            role="member",
        )
    )
    session.add(
        ChatParticipant(
            chat_id=chat.id,
            user_id=payload.recipient_id,
            role="member",
        )
    )

    message = Message(
        chat_id=chat.id,
        sender_id=sender_id,
        content=content,
        message_type="text",
    )

    session.add(message)
    session.flush()
    session.refresh(message)

    chat.last_message_id = message.id
    chat.updated_at = message.created_at

    session.commit()
    session.refresh(message)
    session.refresh(chat)

    public_message = to_message_public(message, current_user)

    chat_update = {
        "chat_id": chat.id,
        "last_message": public_message.model_dump(mode="json", by_alias=True),
    }

    for participant_id in participant_ids:
        await sio.emit(
            "chat_updated",
            chat_update,
            room=f"user:{participant_id}",
        )

    return {
        "chat": ChatListItem(
            id=chat.id,
            type=chat.type,
            avatar_url=chat.avatar_url,
            display_title=(
                f"{recipient.first_name} {recipient.last_name}"
                if recipient.last_name
                else recipient.first_name
            ),
            display_avatar_url=recipient.avatar_url,
            other_user_id=recipient.id,
            last_message_id=message.id,
            last_message_text=message.content,
            last_message_sender_id=message.sender_id,
            last_message_created_at=message.created_at,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            pinned_order=None,
        ),
        "message": public_message,
    }


@router.post(
    "/chats/{chat_id}/messages",
    response_model=MessagePublic,
    dependencies=[Depends(message_rate_limiter)],
)
async def create_message(
    chat_id: int,
    payload: MessageCreate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = require_chat_permission(session, chat_id, user_id, "send_messages")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(
            status_code=500,
            detail="Chat was not found",
        )
    assert_direct_chat_message_allowed(session, chat, user_id)

    reply_target = get_reply_target(
        session,
        chat_id,
        user_id,
        payload.reply_to_message_id,
    )

    message = Message(
        chat_id=chat_id,
        sender_id=user_id,
        content=content,
        message_type="text",
        reply_to_message_id=reply_target.id if reply_target else None,
    )

    session.add(message)
    session.flush()
    session.refresh(message)

    chat.last_message_id = message.id
    chat.updated_at = message.created_at

    # messages in self chats are always read
    if chat.type == "self":
        participant.last_read_message_id = message.id
        participant.last_read_at = datetime.now(timezone.utc)
        session.add(participant)

    session.commit()
    session.refresh(message)
    session.refresh(chat)

    reply_to = build_message_reply_preview(session, message, user_id)
    public_message = to_message_public(message, current_user, reply_to=reply_to)

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        participant_message = to_message_public(
            message,
            current_user,
            reply_to=build_message_reply_preview(session, message, participant_id),
        ).model_dump(mode="json", by_alias=True)
        await sio.emit(
            "chat_updated",
            {
                "chat_id": chat.id,
                "last_message": participant_message,
            },
            room=f"user:{participant_id}",
        )

    return public_message


@router.post(
    "/chats/{chat_id}/messages/voice",
    response_model=MessagePublic,
    dependencies=[Depends(upload_rate_limiter)],
)
async def create_voice_message(
    chat_id: int,
    file: Annotated[UploadFile, File()],
    duration_ms: Annotated[int, Form()],
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    reply_to_message_id: Annotated[int | None, Form()] = None,
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = require_chat_permission(
        session,
        chat_id,
        user_id,
        "send_voice_messages",
    )

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    assert_direct_chat_message_allowed(session, chat, user_id)

    if duration_ms <= 0 or duration_ms > 10 * 60 * 1000:
        raise HTTPException(
            status_code=400,
            detail="Voice message duration is invalid",
        )

    content_type = file.content_type or ""
    base_content_type = content_type.split(";", 1)[0].strip()
    extension = VOICE_MESSAGE_ALLOWED_TYPES.get(base_content_type)
    if extension is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported voice message format",
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Voice message is empty")
    if len(audio_bytes) > VOICE_MESSAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Voice message is too large")

    reply_target = get_reply_target(
        session,
        chat_id,
        user_id,
        reply_to_message_id,
    )

    VOICE_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    upload_path = VOICE_UPLOADS_DIR / filename
    upload_path.write_bytes(audio_bytes)
    audio_url = f"{VOICE_UPLOAD_URL_PREFIX}/{filename}"

    message = Message(
        chat_id=chat_id,
        sender_id=user_id,
        content=None,
        message_type="voice",
        reply_to_message_id=reply_target.id if reply_target else None,
        metadata={
            "audio_url": audio_url,
            "duration_ms": duration_ms,
            "mime_type": content_type or base_content_type,
            "size_bytes": len(audio_bytes),
        },
    )

    session.add(message)
    session.flush()
    session.refresh(message)

    chat.last_message_id = message.id
    chat.updated_at = message.created_at

    if chat.type == "self":
        participant.last_read_message_id = message.id
        participant.last_read_at = datetime.now(timezone.utc)
        session.add(participant)

    session.commit()
    session.refresh(message)
    session.refresh(chat)

    reply_to = build_message_reply_preview(session, message, user_id)
    public_message = to_message_public(message, current_user, reply_to=reply_to)

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        participant_message = to_message_public(
            message,
            current_user,
            reply_to=build_message_reply_preview(session, message, participant_id),
        ).model_dump(mode="json", by_alias=True)
        await sio.emit(
            "chat_updated",
            {
                "chat_id": chat.id,
                "last_message": participant_message,
            },
            room=f"user:{participant_id}",
        )

    return public_message


@router.post(
    "/chats/{chat_id}/messages/files",
    response_model=MessagePublic,
    dependencies=[Depends(upload_rate_limiter)],
)
async def create_file_message(
    chat_id: int,
    files: Annotated[list[UploadFile], File()],
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    content: Annotated[str | None, Form()] = None,
    reply_to_message_id: Annotated[int | None, Form()] = None,
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    if not files:
        raise HTTPException(status_code=400, detail="Attach at least one file")

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    require_active_participant(session, chat_id, user_id)
    assert_direct_chat_message_allowed(session, chat, user_id)

    prepared_attachments = [
        await prepare_file_attachment(file)
        for file in files
    ]
    participant = require_chat_permission(
        session,
        chat_id,
        user_id,
        prepared_attachments[0]["permission_name"],
    )
    for permission_name in {
        attachment["permission_name"] for attachment in prepared_attachments[1:]
    }:
        require_chat_permission(session, chat_id, user_id, permission_name)

    caption = parse_file_caption(content)

    reply_target = get_reply_target(
        session,
        chat_id,
        user_id,
        reply_to_message_id,
    )

    stored_attachments = [
        save_prepared_file_attachment(prepared_attachment)
        for prepared_attachment in prepared_attachments
    ]
    message_type = (
        str(stored_attachments[0]["message_type"])
        if len(stored_attachments) == 1
        else "album"
    )
    metadata = (
        stored_attachments[0]
        if len(stored_attachments) == 1
        else {"attachments": stored_attachments}
    )

    message = Message(
        chat_id=chat_id,
        sender_id=user_id,
        content=caption,
        message_type=message_type,
        reply_to_message_id=reply_target.id if reply_target else None,
        metadata=metadata,
    )

    session.add(message)
    session.flush()
    session.refresh(message)

    chat.last_message_id = message.id
    chat.updated_at = message.created_at

    if chat.type == "self":
        participant.last_read_message_id = message.id
        participant.last_read_at = datetime.now(timezone.utc)
        session.add(participant)

    session.commit()
    session.refresh(message)
    session.refresh(chat)

    reply_to = build_message_reply_preview(session, message, user_id)
    public_message = to_message_public(message, current_user, reply_to=reply_to)

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        participant_message = to_message_public(
            message,
            current_user,
            reply_to=build_message_reply_preview(session, message, participant_id),
        ).model_dump(mode="json", by_alias=True)
        await sio.emit(
            "chat_updated",
            {
                "chat_id": chat.id,
                "last_message": participant_message,
            },
            room=f"user:{participant_id}",
        )

    return public_message


async def apply_file_message_edit(
    message_id: int,
    session: SessionDep,
    current_user: User,
    content: str | None = None,
    existing_file_urls: list[str] | None = None,
    files: list[UploadFile] | None = None,
):
    message = session.get(Message, message_id)

    if message is None or message.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    require_active_participant(session, message.chat_id, user_id)
    chat = session.get(Chat, message.chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    assert_direct_chat_message_allowed(session, chat, user_id)

    if message.sender_id != user_id:
        raise HTTPException(
            status_code=403, detail="You can only edit your own messages"
        )

    message_user_state = session.get(MessageUserState, (message.id, user_id))
    if message_user_state and message_user_state.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    caption = parse_file_caption(content)
    original_attachments = get_message_file_attachments(message)
    original_attachments_by_url = {
        str(attachment["file_url"]): attachment
        for attachment in original_attachments
        if "file_url" in attachment
    }
    kept_attachments = []
    seen_file_urls = set()

    for file_url in existing_file_urls or []:
        if file_url in seen_file_urls:
            continue

        attachment = original_attachments_by_url.get(file_url)
        if attachment is None:
            raise HTTPException(status_code=400, detail="Unknown existing attachment")

        kept_attachments.append(attachment)
        seen_file_urls.add(file_url)

    prepared_attachments = [
        await prepare_file_attachment(file)
        for file in (files or [])
    ]
    for permission_name in {
        attachment["permission_name"] for attachment in prepared_attachments
    }:
        require_chat_permission(session, message.chat_id, user_id, permission_name)

    stored_attachments = [
        *kept_attachments,
        *[
            save_prepared_file_attachment(prepared_attachment)
            for prepared_attachment in prepared_attachments
        ],
    ]

    if stored_attachments:
        message_type, metadata = build_file_message_metadata(stored_attachments)
    elif caption is not None:
        message_type, metadata = "text", {}
    else:
        raise HTTPException(
            status_code=400,
            detail="Message must contain text or at least one file",
        )

    message.content = caption
    message.message_type = message_type
    message.metadata_ = metadata
    message.updated_at = datetime.now(timezone.utc)
    message.edited_at = message.updated_at

    session.add(message)
    session.commit()
    session.refresh(message)

    public_message = to_message_public(
        message,
        current_user,
        message_user_state=message_user_state,
        reply_to=build_message_reply_preview(session, message, user_id),
    )

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == message.chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        participant_message_user_state = session.get(
            MessageUserState, (message.id, participant_id)
        )
        participant_public_message = to_message_public(
            message,
            current_user,
            message_user_state=participant_message_user_state,
            reply_to=build_message_reply_preview(session, message, participant_id),
        )
        await sio.emit(
            "message_updated",
            participant_public_message.model_dump(mode="json", by_alias=True),
            room=f"user:{participant_id}",
        )

    return public_message


@router.get(
    "/chats/{chat_id}/messages/search",
    response_model=list[MessagePublic],
)
def search_chat_messages(
    chat_id: int,
    query: str,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    require_active_participant(session, chat_id, user_id)

    normalized_query = query.strip()
    if not normalized_query:
        return []

    messages = session.exec(
        select(Message)
        .where(
            col(Message.chat_id) == chat_id,
            col(Message.deleted_at).is_(None),
            col(Message.content).ilike(f"%{normalized_query}%"),
            ~exists().where(
                col(MessageUserState.message_id) == col(Message.id),
                col(MessageUserState.user_id) == user_id,
                col(MessageUserState.deleted_at).is_not(None),
            ),
        )
        .order_by(col(Message.created_at).desc())
        .limit(50)
    ).all()

    public_messages = []

    for message in messages:
        sender = session.get(User, message.sender_id)
        reply_to = build_message_reply_preview(session, message, user_id)

        public_messages.append(to_message_public(message, sender, reply_to=reply_to))

    return public_messages


@router.post("/messages/{message_id}/pin")
async def pin_message(
    message_id: int,
    payload: MessagePinRequest,
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
):
    if user.id is None:
        raise HTTPException(status_code=404, detail="User not found")

    message = session.get(Message, message_id)
    message_user_state = session.get(MessageUserState, (message_id, user.id))
    if message is None or message.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message_user_state is not None and message_user_state.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    chat = session.get(Chat, message.chat_id)
    if chat is None or chat.id is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    require_active_participant(session, chat.id, user.id)

    if payload.scope == "me":
        if chat.type == "group":
            raise HTTPException(
                status_code=400,
                detail="Personal pins are not supported in group chats",
            )
        if message_user_state is None:
            message_user_state = MessageUserState(
                message_id=message_id, user_id=user.id
            )
        message_user_state.pinned_at = datetime.now(timezone.utc)
        session.add(message_user_state)
        session.commit()
        return {"ok": True}

    if payload.scope == "chat":
        if chat.type == "group":
            require_chat_permission(session, chat.id, user.id, "pin_messages")

        message.pinned_at = datetime.now(timezone.utc)
        message.pinned_by = user.id
        session.add(message)
        session.commit()

        participant_ids = session.exec(
            select(col(ChatParticipant.user_id)).where(
                col(ChatParticipant.chat_id) == chat.id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).all()

        pin_update = {
            "message_id": message.id,
            "chat_id": chat.id,
            "pinned_at": message.pinned_at.isoformat() if message.pinned_at else None,
            "pinned_by": message.pinned_by,
        }

        for participant_id in participant_ids:
            await sio.emit(
                "message_pin_updated",
                pin_update,
                room=f"user:{participant_id}",
            )

        return {"ok": True}

    raise HTTPException(status_code=400, detail="Invalid pin scope")


@router.delete("/messages/{message_id}/unpin")
async def unpin_message(
    message_id: int,
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
):
    if user.id is None:
        raise HTTPException(status_code=404, detail="User not found")

    message = session.get(Message, message_id)
    message_user_state = session.get(MessageUserState, (message_id, user.id))
    if message is None or message.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message_user_state is not None and message_user_state.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    chat = session.get(Chat, message.chat_id)
    if chat is None or chat.id is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    require_active_participant(session, chat.id, user.id)

    if chat.type == "group":
        require_chat_permission(session, chat.id, user.id, "pin_messages")

        message.pinned_at = None
        message.pinned_by = None
        session.add(message)
        session.commit()
        participant_ids = session.exec(
            select(col(ChatParticipant.user_id)).where(
                col(ChatParticipant.chat_id) == chat.id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).all()

        for participant_id in participant_ids:
            await sio.emit(
                "message_pin_updated",
                {
                    "message_id": message.id,
                    "chat_id": chat.id,
                    "pinned_at": None,
                    "pinned_by": None,
                },
                room=f"user:{participant_id}",
            )
        return {"ok": True}

    else:
        if message_user_state is not None:
            message_user_state.pinned_at = None
            session.add(message_user_state)
        message.pinned_at = None
        message.pinned_by = None
        session.add(message)
        session.commit()

        participant_ids = session.exec(
            select(col(ChatParticipant.user_id)).where(
                col(ChatParticipant.chat_id) == chat.id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).all()

        for participant_id in participant_ids:
            await sio.emit(
                "message_pin_updated",
                {
                    "message_id": message.id,
                    "chat_id": chat.id,
                    "pinned_at": None,
                    "pinned_by": None,
                },
                room=f"user:{participant_id}",
            )

        return {"ok": True}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    payload: MessageDeleteRequest,
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
):
    if user.id is None:
        raise HTTPException(status_code=404, detail="User not found")

    message = session.get(Message, message_id)
    message_user_state = session.get(MessageUserState, (message_id, user.id))
    if message is None or message.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message_user_state is not None and message_user_state.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    chat = session.get(Chat, message.chat_id)
    if chat is None or chat.id is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    require_active_participant(session, chat.id, user.id)

    if chat.type == "direct":
        if payload.scope == "me":
            if message_user_state is None:
                message_user_state = MessageUserState(
                    message_id=message_id, user_id=user.id
                )
            message_user_state.deleted_at = datetime.now(timezone.utc)
            session.add(message_user_state)
            session.commit()
        elif payload.scope == "chat":
            if message.sender_id != user.id:
                raise HTTPException(
                    status_code=403, detail="Can't delete other's messages for everyone"
                )
            message.deleted_at = datetime.now(timezone.utc)
            message.deleted_by = user.id
            session.add(message)
            session.commit()

            participant_ids = session.exec(
                select(col(ChatParticipant.user_id)).where(
                    col(ChatParticipant.chat_id) == chat.id,
                    col(ChatParticipant.left_at).is_(None),
                )
            ).all()

            for participant_id in participant_ids:
                await sio.emit(
                    "message_deleted",
                    {
                        "message_id": message.id,
                        "chat_id": chat.id,
                    },
                    room=f"user:{participant_id}",
                )
    elif chat.type == "self":
        if payload.scope == "me":
            raise HTTPException(
                status_code=403, detail="Can't delete message for one user"
            )
        if payload.scope == "chat":
            message.deleted_at = datetime.now(timezone.utc)
            message.deleted_by = user.id
            session.add(message)
            session.commit()
    elif chat.type == "group":
        if payload.scope == "me":
            raise HTTPException(
                status_code=403, detail="Can't delete message for one user"
            )
        if payload.scope == "chat":
            if message.sender_id != user.id:
                require_chat_permission(session, chat.id, user.id, "delete_messages")
            message.deleted_at = datetime.now(timezone.utc)
            message.deleted_by = user.id
            session.add(message)
            session.commit()

            participant_ids = session.exec(
                select(col(ChatParticipant.user_id)).where(
                    col(ChatParticipant.chat_id) == chat.id,
                    col(ChatParticipant.left_at).is_(None),
                )
            ).all()

            for participant_id in participant_ids:
                await sio.emit(
                    "message_deleted",
                    {
                        "message_id": message.id,
                        "chat_id": chat.id,
                    },
                    room=f"user:{participant_id}",
                )

    return {"ok": True}


@router.patch("/messages/{message_id}", response_model=MessagePublic)
async def edit_message(
    message_id: int,
    request: Request,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()

    if content_type == "multipart/form-data":
        form = await request.form()
        raw_content = form.get("content")
        existing_file_urls = [
            value
            for value in form.getlist("existing_file_urls")
            if isinstance(value, str)
        ]
        uploaded_files: list[UploadFile] = []
        for value in form.getlist("files"):
            if hasattr(value, "read") and hasattr(value, "filename"):
                uploaded_files.append(cast(UploadFile, value))

        return await apply_file_message_edit(
            message_id,
            session,
            current_user,
            raw_content if isinstance(raw_content, str) else None,
            existing_file_urls,
            uploaded_files,
        )

    data = await request.json()
    payload = MessageEditRequest.model_validate(data)
    message = session.get(Message, message_id)

    if message is None or message.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    require_active_participant(session, message.chat_id, user_id)
    chat = session.get(Chat, message.chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    assert_direct_chat_message_allowed(session, chat, user_id)

    if message.sender_id != user_id:
        raise HTTPException(
            status_code=403, detail="You can only edit your own messages"
        )

    message_user_state = session.get(MessageUserState, (message.id, user_id))
    if message_user_state and message_user_state.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message.content = content
    message.updated_at = datetime.now(timezone.utc)
    message.edited_at = message.updated_at

    session.add(message)
    session.commit()
    session.refresh(message)

    public_message = to_message_public(
        message,
        current_user,
        message_user_state=message_user_state,
        reply_to=build_message_reply_preview(session, message, user_id),
    )

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == message.chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        participant_message_user_state = session.get(
            MessageUserState, (message.id, participant_id)
        )
        participant_public_message = to_message_public(
            message,
            current_user,
            message_user_state=participant_message_user_state,
            reply_to=build_message_reply_preview(session, message, participant_id),
        )
        await sio.emit(
            "message_updated",
            participant_public_message.model_dump(mode="json", by_alias=True),
            room=f"user:{participant_id}",
        )

    return public_message
