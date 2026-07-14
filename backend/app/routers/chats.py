from datetime import datetime, timezone
from typing import Annotated

from app.constants import SAVED_MESSAGES_AVATAR_URL
from app.db import SessionDep
from app.dependencies import get_current_user
from app.models import (
    AddGroupMembers,
    Chat,
    ChatDeleteRequest,
    ChatListItem,
    ChatMemberPermissions,
    ChatMemberPublic,
    ChatParticipant,
    ChatReadRequest,
    ChatSettingsUpdate,
    GroupCreate,
    Message,
    MessageUserState,
    PinnedChatOrderResponse,
    PinnedChatOrderUpdate,
    User,
    UserBlock,
)
from app.permissions import SYSTEM_ROLE_DEFAULTS
from app.services.chats import (
    assert_actor_strictly_outranks_target,
    assert_admin_permissions_do_not_restrict_enabled_member_permissions,
    assert_permissions_are_subset_or_equal,
    assert_valid_admin_permission_list,
    assert_valid_permission_list,
    get_effective_member_permissions,
    get_effective_permissions,
    member_permissions_reduce_admin_rights,
    normalize_member_permission_overrides,
    require_active_participant,
    require_chat_permission,
)
from app.services.messages import get_message_preview_text, message_is_visible_to_user
from app.services.uploads import save_avatar_upload
from app.socket import sio
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, update
from sqlmodel import Session, col, select

router = APIRouter(tags=["chats"])

def to_chat_member_public(
    participant: ChatParticipant,
    user: User,
) -> ChatMemberPublic:
    return ChatMemberPublic(
        user_id=participant.user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        status=user.status,
        role=participant.role,
        joined_at=participant.joined_at,
        added_by=participant.added_by,
        member_permissions=participant.member_permissions,
    )


def group_create_from_form(
    title: Annotated[str, Form()],
    description: Annotated[str | None, Form()] = None,
    member_ids: Annotated[list[int] | None, Form()] = None,
) -> GroupCreate:
    return GroupCreate(
        title=title,
        description=description,
        member_ids=member_ids or [],
    )


def get_chat_sort_timestamp(chat: ChatListItem) -> float:
    value = chat.last_message_created_at or chat.created_at
    return value.timestamp() if value is not None else 0


def get_next_pinned_order(session: Session, user_id: int) -> int:
    max_order = session.exec(
        select(func.max(col(ChatParticipant.pinned_order))).where(
            col(ChatParticipant.user_id) == user_id,
            col(ChatParticipant.left_at).is_(None),
            col(ChatParticipant.is_pinned).is_(True),
        )
    ).one()
    return (max_order or 0) + 1


async def emit_chat_permissions_updated(
    chat_id: int,
    user_ids: list[int],
) -> None:
    for user_id in set(user_ids):
        await sio.emit(
            "chat_permissions_updated",
            {"chat_id": chat_id},
            room=f"user:{user_id}",
        )


@router.get("/chats", response_model=list[ChatListItem])
def get_chats(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    rows = session.exec(
        select(ChatParticipant, Chat)
        .join(Chat, col(Chat.id) == col(ChatParticipant.chat_id))
        .where(
            col(ChatParticipant.user_id) == current_user_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()
    result = []

    for current_participant, chat in rows:
        display_title = chat.title
        display_avatar_url = chat.avatar_url or "/favicon.svg"
        other_user_id = None
        other_last_read_at = None
        other_last_read_message_id = None
        is_blocked_by_other = False
        member_ids: list[int] = []
        member_count = 0
        current_user_role = None

        if chat.id is None or chat.created_at is None:
            raise HTTPException(
                status_code=500,
                detail="Chat was not fetched correctly",
            )

        if chat.type == "self":
            display_title = "Saved Messages"
            display_avatar_url = SAVED_MESSAGES_AVATAR_URL
            unread_count = 0

        elif chat.type == "direct":
            other_participant = session.exec(
                select(ChatParticipant).where(
                    col(ChatParticipant.chat_id) == chat.id,
                    col(ChatParticipant.user_id) != current_user_id,
                    col(ChatParticipant.left_at).is_(None),
                )
            ).first()

            if other_participant is not None:
                other_user = session.get(User, other_participant.user_id)

                if other_user is not None:
                    other_user_id = other_user.id
                    display_title = (
                        f"{other_user.first_name} {other_user.last_name}"
                        if other_user.last_name
                        else other_user.first_name
                    )
                    display_avatar_url = other_user.avatar_url
                    other_last_read_message_id = other_participant.last_read_message_id
                    other_last_read_at = other_participant.last_read_at
                    is_blocked_by_other = (
                        session.get(UserBlock, (other_user_id, current_user_id))
                        is not None
                    )
        else:
            member_ids = list(
                session.exec(
                    select(col(ChatParticipant.user_id)).where(
                        col(ChatParticipant.chat_id) == chat.id,
                        col(ChatParticipant.left_at).is_(None),
                    )
                ).all()
            )
            member_count = len(member_ids)
            current_user_role = current_participant.role

        last_message = session.exec(
            select(Message)
            .where(
                col(Message.chat_id) == chat.id,
                col(Message.deleted_at).is_(None),
                message_is_visible_to_user(
                    current_user_id,
                    current_participant.cleared_at,
                ),
            )
            .order_by(col(Message.created_at).desc())
        ).first()

        if last_message is None and (
            chat.type == "direct"
            or (
                chat.type == "group"
                and current_participant.cleared_at is not None
                and member_count < 2
            )
        ):
            continue

        last_read_message_id = (
            current_participant.last_read_message_id if current_participant else None
        )
        if chat.type == "self" and last_message is not None:
            last_read_message_id = last_message.id

        unread_statement = select(func.count(col(Message.id))).where(
            col(Message.chat_id) == chat.id,
            col(Message.sender_id) != current_user_id,
            col(Message.deleted_at).is_(None),
            message_is_visible_to_user(
                current_user_id,
                current_participant.cleared_at,
            ),
        )

        if last_read_message_id is not None:
            unread_statement = unread_statement.where(
                col(Message.id) > last_read_message_id
            )

        unread_count = session.exec(unread_statement).one()

        result.append(
            ChatListItem(
                id=chat.id,
                type=chat.type,
                title=chat.title,
                description=chat.description,
                avatar_url=chat.avatar_url,
                display_title=display_title or "Chat",
                display_avatar_url=display_avatar_url,
                other_user_id=other_user_id,
                is_blocked_by_other=is_blocked_by_other,
                member_ids=member_ids,
                member_count=member_count,
                current_user_role=current_user_role,
                last_message_id=last_message.id if last_message else None,
                last_message_text=get_message_preview_text(last_message)
                if last_message
                else None,
                last_message_sender_id=last_message.sender_id if last_message else None,
                last_message_created_at=last_message.created_at
                if last_message
                else None,
                unread_count=unread_count,
                current_last_read_message_id=last_read_message_id,
                other_last_read_message_id=other_last_read_message_id,
                other_last_read_at=other_last_read_at,
                created_at=chat.created_at,
                updated_at=chat.updated_at,
                is_pinned=current_participant.is_pinned,
                pinned_order=current_participant.pinned_order,
            )
        )
    result.sort(
        key=lambda chat: (
            0 if chat.is_pinned else 1,
            chat.pinned_order
            if chat.is_pinned and chat.pinned_order is not None
            else 2_147_483_647,
            -get_chat_sort_timestamp(chat),
        )
    )
    return result


@router.get("/chats/direct/by-user/{user_id}", response_model=ChatListItem | None)
def get_direct_chat_by_user(
    user_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user_id == current_user_id:
        row = session.exec(
            select(Chat, ChatParticipant)
            .join(ChatParticipant, col(ChatParticipant.chat_id) == col(Chat.id))
            .where(
                col(Chat.type) == "self",
                col(ChatParticipant.user_id) == current_user_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).first()

        if row is None:
            raise HTTPException(status_code=404, detail="Self chat not found")

        chat, current_participant = row
        if chat.id is None or chat.created_at is None:
            raise HTTPException(
                status_code=500,
                detail="Chat was not fetched correctly",
            )

        last_message = session.exec(
            select(Message)
            .where(
                col(Message.chat_id) == chat.id,
                col(Message.deleted_at).is_(None),
                message_is_visible_to_user(
                    current_user_id,
                    current_participant.cleared_at,
                ),
            )
            .order_by(col(Message.created_at).desc())
        ).first()

        return ChatListItem(
            id=chat.id,
            type=chat.type,
            title=chat.title,
            description=chat.description,
            avatar_url=chat.avatar_url,
            display_title="Saved Messages",
            display_avatar_url=SAVED_MESSAGES_AVATAR_URL,
            last_message_id=last_message.id if last_message else None,
            last_message_text=get_message_preview_text(last_message)
            if last_message
            else None,
            last_message_sender_id=last_message.sender_id if last_message else None,
            last_message_created_at=last_message.created_at if last_message else None,
            unread_count=0,
            current_last_read_message_id=last_message.id
            if last_message
            else current_participant.last_read_message_id,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            is_pinned=current_participant.is_pinned,
            pinned_order=current_participant.pinned_order,
        )

    other_user = session.get(User, user_id)
    if other_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    participant_ids = [current_user_id, user_id]
    matching_chat_ids = (
        select(col(ChatParticipant.chat_id))
        .where(
            col(ChatParticipant.user_id).in_(participant_ids),
            col(ChatParticipant.left_at).is_(None),
        )
        .group_by(col(ChatParticipant.chat_id))
        .having(func.count(col(ChatParticipant.user_id)) == 2)
    )

    row = session.exec(
        select(Chat, ChatParticipant)
        .join(ChatParticipant, col(ChatParticipant.chat_id) == col(Chat.id))
        .where(
            col(Chat.type) == "direct",
            col(Chat.id).in_(matching_chat_ids),
            col(ChatParticipant.user_id) == current_user_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).first()

    if row is None:
        return None

    chat, current_participant = row
    if chat.id is None or chat.created_at is None:
        raise HTTPException(status_code=500, detail="Chat was not fetched correctly")

    other_participant = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat.id,
            col(ChatParticipant.user_id) == user_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).first()

    last_message = session.exec(
        select(Message)
        .where(
            col(Message.chat_id) == chat.id,
            col(Message.deleted_at).is_(None),
            message_is_visible_to_user(
                current_user_id,
                current_participant.cleared_at,
            ),
        )
        .order_by(col(Message.created_at).desc())
    ).first()

    last_read_message_id = current_participant.last_read_message_id
    unread_statement = select(func.count(col(Message.id))).where(
        col(Message.chat_id) == chat.id,
        col(Message.sender_id) != current_user_id,
        col(Message.deleted_at).is_(None),
        message_is_visible_to_user(
            current_user_id,
            current_participant.cleared_at,
        ),
    )

    if last_read_message_id is not None:
        unread_statement = unread_statement.where(
            col(Message.id) > last_read_message_id
        )

    unread_count = session.exec(unread_statement).one()

    return ChatListItem(
        id=chat.id,
        type=chat.type,
        title=chat.title,
        description=chat.description,
        avatar_url=chat.avatar_url,
        display_title=(
            f"{other_user.first_name} {other_user.last_name}"
            if other_user.last_name
            else other_user.first_name
        ),
        display_avatar_url=other_user.avatar_url,
        other_user_id=other_user.id,
        is_blocked_by_other=session.get(
            UserBlock,
            (other_user.id, current_user_id),
        )
        is not None,
        last_message_id=last_message.id if last_message else None,
        last_message_text=get_message_preview_text(last_message)
        if last_message
        else None,
        last_message_sender_id=last_message.sender_id if last_message else None,
        last_message_created_at=last_message.created_at if last_message else None,
        unread_count=unread_count,
        current_last_read_message_id=last_read_message_id,
        other_last_read_message_id=other_participant.last_read_message_id
        if other_participant
        else None,
        other_last_read_at=other_participant.last_read_at
        if other_participant
        else None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        is_pinned=current_participant.is_pinned,
        pinned_order=current_participant.pinned_order,
    )


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: int,
    payload: ChatDeleteRequest,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = require_active_participant(session, chat_id, user_id)
    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()
    is_group_history_clear = chat.type == "group" and len(participant_ids) >= 2
    deleted_at = datetime.now(timezone.utc)
    delete_messages_for_everyone = (
        chat.type == "self" or payload.delete_messages_for_everyone
    )
    deleted_message_ids: list[int] = []

    if delete_messages_for_everyone:
        message_ids = session.exec(
            select(col(Message.id)).where(
                col(Message.chat_id) == chat_id,
                col(Message.sender_id) == user_id,
                col(Message.deleted_at).is_(None),
            )
        ).all()
        deleted_message_ids = [
            message_id for message_id in message_ids if message_id is not None
        ]
        if deleted_message_ids:
            session.exec(
                update(Message)
                .where(col(Message.id).in_(deleted_message_ids))
                .values(deleted_at=deleted_at, deleted_by=user_id)
            )

    participant.cleared_at = deleted_at
    if not is_group_history_clear:
        participant.is_pinned = False
        participant.pinned_order = None
    session.add(participant)
    session.commit()

    if deleted_message_ids:
        deletion_event = {
            "chat_id": chat_id,
            "message_ids": deleted_message_ids,
        }

        for participant_id in participant_ids:
            if participant_id == user_id:
                continue
            await sio.emit(
                "chat_messages_deleted",
                deletion_event,
                room=f"user:{participant_id}",
            )

    return {"ok": True, "cleared_history": is_group_history_clear}


@router.post("/chats/{chat_id}/read")
async def chat_read(
    chat_id: int,
    payload: ChatReadRequest,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    participant = require_active_participant(session, chat_id, user_id)
    read_message = session.get(Message, payload.last_read_message_id)
    if (
        read_message is None
        or read_message.chat_id != chat_id
        or read_message.deleted_at is not None
        or (
            participant.cleared_at is not None
            and (
                read_message.created_at is None
                or read_message.created_at <= participant.cleared_at
            )
        )
    ):
        raise HTTPException(
            status_code=400,
            detail="Read marker is invalid for this chat",
        )
    message_user_state = session.get(
        MessageUserState,
        (payload.last_read_message_id, user_id),
    )
    if message_user_state is not None and message_user_state.deleted_at is not None:
        raise HTTPException(
            status_code=400,
            detail="Read marker is invalid for this chat",
        )

    participant.last_read_message_id = payload.last_read_message_id
    participant.last_read_at = datetime.now(timezone.utc)

    session.add(participant)
    session.commit()
    session.refresh(participant)

    read_update = {
        "chat_id": chat_id,
        "user_id": user_id,
        "last_read_message_id": participant.last_read_message_id,
        "last_read_at": participant.last_read_at.isoformat()
        if participant.last_read_at
        else None,
    }

    participant_ids = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        await sio.emit(
            "chat_read",
            read_update,
            room=f"user:{participant_id}",
        )

    return {"ok": True}


@router.get("/chats/{chat_id}/members", response_model=list[ChatMemberPublic])
def get_chat_members(
    chat_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    require_active_participant(session, chat_id, user_id)

    participants = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    members = []

    for member in participants:
        member_user = session.get(User, member.user_id)
        if member_user is None:
            raise HTTPException(status_code=404, detail="User not found")

        members.append(to_chat_member_public(member, member_user))

    return members


@router.get("/chats/{chat_id}/permissions")
def get_current_user_chat_permissions(
    chat_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = require_active_participant(session, chat_id, user_id)
    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Direct and self chats have no configurable group permissions.
    if chat.type != "group":
        return {"send_messages": True}

    return get_effective_permissions(participant, session)


@router.patch("/chats/pinned-order", response_model=PinnedChatOrderResponse)
def reorder_pinned_chats(
    payload: PinnedChatOrderUpdate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    if len(payload.chat_ids) != len(set(payload.chat_ids)):
        raise HTTPException(status_code=400, detail="Duplicate chat IDs are not allowed")

    pinned_participants = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.user_id) == user_id,
            col(ChatParticipant.left_at).is_(None),
            col(ChatParticipant.is_pinned).is_(True),
        )
    ).all()
    pinned_participants_by_chat_id = {
        participant.chat_id: participant for participant in pinned_participants
    }

    if set(payload.chat_ids) != set(pinned_participants_by_chat_id):
        raise HTTPException(
            status_code=400,
            detail="Pinned chat order must include all pinned chats and only pinned chats",
        )

    for index, chat_id in enumerate(payload.chat_ids, start=1):
        participant = pinned_participants_by_chat_id[chat_id]
        participant.pinned_order = index
        session.add(participant)

    session.commit()

    return PinnedChatOrderResponse(ok=True, chat_ids=payload.chat_ids)


@router.patch("/chats/{chat_id}/settings")
def pin_chat(
    chat_id: int,
    payload: ChatSettingsUpdate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    participant = require_active_participant(session, chat_id, user_id)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "is_pinned":
            next_is_pinned = bool(value)
            participant.is_pinned = next_is_pinned

            if next_is_pinned and participant.pinned_order is None:
                participant.pinned_order = get_next_pinned_order(session, user_id)
            elif not next_is_pinned:
                participant.pinned_order = None
            continue

        setattr(participant, key, value)
    session.add(participant)
    session.commit()
    session.refresh(participant)

    return {
        "ok": True,
        "chat_id": chat_id,
        "is_pinned": participant.is_pinned,
        "pinned_order": participant.pinned_order,
        "is_archived": participant.is_archived,
        "muted_until": participant.muted_until,
    }


@router.post("/chats/group", response_model=ChatListItem)
async def create_group_chat(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    payload: Annotated[GroupCreate, Depends(group_create_from_form)],
    avatar: Annotated[UploadFile | None, File()] = None,
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    normalized_title = payload.title.strip()
    normalized_description = payload.description.strip() if payload.description else None
    if not normalized_title:
        raise HTTPException(status_code=400, detail="Group name is required")
    if len(normalized_title) > 128:
        raise HTTPException(
            status_code=400,
            detail="Group name must be at most 128 characters.",
        )
    if normalized_description is not None and len(normalized_description) > 255:
        raise HTTPException(
            status_code=400,
            detail="Description must be at most 255 characters.",
        )

    avatar_url = await save_avatar_upload(avatar)

    chat = Chat(
        type="group",
        title=normalized_title,
        description=normalized_description or None,
        avatar_url=avatar_url,
    )
    session.add(chat)
    session.flush()

    if chat.id is None:
        raise HTTPException(status_code=500, detail="Chat was not created")

    session.add(
        ChatMemberPermissions(
            chat_id=chat.id,
            permissions=SYSTEM_ROLE_DEFAULTS["member"].copy(),
        )
    )

    session.add(
        ChatParticipant(
            chat_id=chat.id,
            user_id=user_id,
            role="owner",
        )
    )

    member_ids = [user_id]

    for member_id in set(payload.member_ids):
        if member_id == user_id:
            continue

        member = session.get(User, member_id)
        if member is None:
            raise HTTPException(status_code=404, detail=f"User {member_id} not found")

        member_ids.append(member_id)
        session.add(
            ChatParticipant(
                chat_id=chat.id,
                user_id=member_id,
                added_by=user_id,
                role="member",
            )
        )

    session.commit()
    session.refresh(chat)

    chat_list_item = ChatListItem(
        id=chat.id,
        type=chat.type,
        title=chat.title,
        description=chat.description,
        avatar_url=chat.avatar_url,
        display_title=normalized_title,
        display_avatar_url=chat.avatar_url or "/favicon.svg",
        member_ids=member_ids,
        member_count=len(member_ids),
        current_user_role="owner",
        last_message_id=None,
        last_message_text=None,
        last_message_sender_id=None,
        last_message_created_at=None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        pinned_order=None,
    )

    for member_id in member_ids:
        member_chat_list_item = chat_list_item.model_copy(
            update={
                "current_user_role": "owner" if member_id == user_id else "member",
            }
        )
        await sio.emit(
            "chat_created",
            member_chat_list_item.model_dump(mode="json"),
            room=f"user:{member_id}",
        )

    return chat_list_item


@router.post("/chats/{chat_id}/members")
async def add_group_members(
    chat_id: int,
    payload: AddGroupMembers,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    require_chat_permission(session, chat_id, user_id, "add_members")

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(
            status_code=500,
            detail="Chat was not found",
        )

    if chat.type != "group":
        raise HTTPException(
            status_code=403, detail="Can't add members to non-group chats"
        )

    participants = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    roles_by_user_id = {
        participant.user_id: participant.role for participant in participants
    }

    new_member_ids = []

    # add users
    for member_id in set(payload.member_ids):
        member = session.get(User, member_id)
        if member is None:
            raise HTTPException(status_code=404, detail="User not found")

        if member_id in roles_by_user_id:
            continue

        new_member_ids.append(member_id)
        roles_by_user_id[member_id] = "member"

        session.add(
            ChatParticipant(
                chat_id=chat_id,
                user_id=member_id,
                added_by=user_id,
                role="member",
            )
        )

    session.commit()

    all_member_ids = list(roles_by_user_id.keys())

    chat_list_item = ChatListItem(
        id=chat_id,
        type=chat.type,
        title=chat.title,
        description=chat.description,
        avatar_url=chat.avatar_url,
        display_title=chat.title if chat.title is not None else "New group chat",
        display_avatar_url=chat.avatar_url or "/favicon.svg",
        member_ids=all_member_ids,
        member_count=len(all_member_ids),
        current_user_role=roles_by_user_id[user_id],
        last_message_id=None,
        last_message_text=None,
        last_message_sender_id=None,
        last_message_created_at=None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        pinned_order=None,
    )

    if not new_member_ids:
        return chat_list_item

    for member_id in all_member_ids:
        member_chat_list_item = chat_list_item.model_copy(
            update={
                "current_user_role": roles_by_user_id[member_id],
            }
        )

        # New users only
        if member_id in new_member_ids:
            await sio.emit(
                "chat_created",
                member_chat_list_item.model_dump(mode="json"),
                room=f"user:{member_id}",
            )
        # Old users only
        else:
            await sio.emit(
                "chat_members_updated",
                {
                    "chat": member_chat_list_item.model_dump(mode="json"),
                    "added_member_ids": new_member_ids,
                    "added_by": user_id,
                },
                room=f"user:{member_id}",
            )

    return chat_list_item


@router.get("/chats/{chat_id}/member-default-permissions")
def get_chat_default_permissions(
    chat_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    require_chat_permission(session, chat_id, user_id, "ban_users")
    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat_member_permissions = session.get(ChatMemberPermissions, chat_id)
    if chat_member_permissions is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat_member_permissions.permissions


@router.patch("/chats/{chat_id}/member-default-permissions")
async def patch_chat_default_permissions(
    chat_id: int,
    new_permissions: dict,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    require_chat_permission(session, chat_id, actor_user.id, "ban_users")

    chat_member_permissions = session.get(ChatMemberPermissions, chat_id)
    if chat_member_permissions is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    assert_valid_permission_list(new_permissions)
    chat_member_permissions.permissions = new_permissions

    participants = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()
    for participant in participants:
        effective_permissions = get_effective_member_permissions(
            new_permissions,
            participant.member_permissions,
        )
        participant.member_permissions = normalize_member_permission_overrides(
            new_permissions,
            effective_permissions,
        )
        session.add(participant)

    session.add(chat_member_permissions)
    session.commit()
    await emit_chat_permissions_updated(
        chat_id,
        [participant.user_id for participant in participants],
    )


@router.patch(
    "/chats/{chat_id}/members/{user_id}/permissions",
    response_model=ChatMemberPublic,
)
async def patch_member_permissions(
    chat_id: int,
    user_id: int,
    new_permissions: dict,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user_id is None:
        raise HTTPException(status_code=404, detail="User not found")

    actor_participant = require_chat_permission(
        session,
        chat_id,
        actor_user.id,
        "ban_users",
    )
    target_participant = require_active_participant(session, chat_id, user_id)

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.type != "group":
        raise HTTPException(
            status_code=403,
            detail="Member permissions only apply to group chats",
        )
    if target_participant.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot manage owner")

    if target_participant.role == "admin":
        actor_permissions = get_effective_permissions(actor_participant, session)
        target_permissions = get_effective_permissions(target_participant, session)
        assert_actor_strictly_outranks_target(
            actor_participant,
            target_participant,
            actor_permissions,
            target_permissions,
        )

    chat_member_permissions = session.get(ChatMemberPermissions, chat_id)
    if chat_member_permissions is None:
        raise HTTPException(status_code=404, detail="Chat permissions not found")

    target_participant.member_permissions = normalize_member_permission_overrides(
        chat_member_permissions.permissions,
        new_permissions,
    )
    effective_member_permissions = get_effective_member_permissions(
        chat_member_permissions.permissions,
        target_participant.member_permissions,
    )

    if target_participant.role == "admin" and member_permissions_reduce_admin_rights(
        chat_member_permissions.permissions,
        effective_member_permissions,
    ):
        target_participant.role = "member"
        target_participant.admin_permissions = {}
        target_participant.promoted_by = None
        target_participant.promoted_at = None

    session.add(target_participant)
    session.commit()
    session.refresh(target_participant)

    target_user = session.get(User, target_participant.user_id)
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    await emit_chat_permissions_updated(chat_id, [target_participant.user_id])
    return to_chat_member_public(target_participant, target_user)


@router.get("/chats/{chat_id}/admins/{user_id}/permissions")
def get_admin_permissions(
    chat_id: int,
    user_id: int,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user_id is None:
        raise HTTPException(status_code=404, detail="User not found")
    actor_participant = require_active_participant(session, chat_id, actor_user.id)
    target_participant = require_active_participant(session, chat_id, user_id)
    if actor_participant == target_participant:
        return get_effective_permissions(target_participant, session)
    require_chat_permission(session, chat_id, actor_user.id, "manage_admins")
    actor_permissions = get_effective_permissions(actor_participant, session)
    target_permissions = get_effective_permissions(target_participant, session)
    if target_participant.role != "admin":
        raise HTTPException(
            status_code=404,
            detail="Target is not an admin",
        )

    assert_actor_strictly_outranks_target(
        actor_participant, target_participant, actor_permissions, target_permissions
    )
    return get_effective_permissions(target_participant, session)


@router.patch("/chats/{chat_id}/admins/{user_id}/permissions")
async def patch_admin_permissions(
    chat_id: int,
    user_id: int,
    new_permissions: dict,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user_id is None:
        raise HTTPException(status_code=404, detail="User not found")
    actor_participant = require_chat_permission(
        session, chat_id, actor_user.id, "manage_admins"
    )
    target_participant = require_active_participant(session, chat_id, user_id)
    actor_permissions = get_effective_permissions(actor_participant, session)
    target_permissions = get_effective_permissions(target_participant, session)
    chat_member_permissions = session.get(ChatMemberPermissions, chat_id)
    if chat_member_permissions is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    if target_participant.role != "admin":
        raise HTTPException(status_code=400, detail="Target is not an admin")

    assert_actor_strictly_outranks_target(
        actor_participant, target_participant, actor_permissions, target_permissions
    )
    assert_valid_admin_permission_list(new_permissions)
    assert_admin_permissions_do_not_restrict_enabled_member_permissions(
        new_permissions, chat_member_permissions.permissions
    )
    assert_permissions_are_subset_or_equal(new_permissions, actor_permissions)

    target_participant.admin_permissions = new_permissions
    session.add(target_participant)
    session.commit()
    await emit_chat_permissions_updated(chat_id, [target_participant.user_id])


@router.post("/chats/{chat_id}/admins/{user_id}/promote")
async def promote_admin(
    chat_id: int,
    user_id: int,
    new_permissions: dict,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user_id is None:
        raise HTTPException(status_code=404, detail="User not found")
    actor_participant = require_chat_permission(
        session, chat_id, actor_user.id, "manage_admins"
    )
    target_participant = require_active_participant(session, chat_id, user_id)
    actor_permissions = get_effective_permissions(actor_participant, session)
    chat_member_permissions = session.get(ChatMemberPermissions, chat_id)
    if chat_member_permissions is None:
        raise HTTPException(status_code=404, detail="Chat permissions not found")

    if target_participant.role != "member":
        raise HTTPException(status_code=403, detail="User is not a member")
    assert_valid_admin_permission_list(new_permissions)
    assert_admin_permissions_do_not_restrict_enabled_member_permissions(
        new_permissions, chat_member_permissions.permissions
    )
    assert_permissions_are_subset_or_equal(new_permissions, actor_permissions)

    target_participant.role = "admin"
    target_participant.admin_permissions = new_permissions
    target_participant.member_permissions = {}
    target_participant.promoted_by = actor_participant.user_id
    target_participant.promoted_at = datetime.now(timezone.utc)

    session.add(target_participant)
    session.commit()
    await emit_chat_permissions_updated(chat_id, [target_participant.user_id])
    return {"ok": True}


@router.post("/chats/{chat_id}/admins/{user_id}/dismiss")
async def dismiss_admin(
    chat_id: int,
    user_id: int,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user_id is None:
        raise HTTPException(status_code=404, detail="User not found")
    actor_participant = require_chat_permission(
        session, chat_id, actor_user.id, "manage_admins"
    )
    target_participant = require_active_participant(session, chat_id, user_id)
    actor_permissions = get_effective_permissions(actor_participant, session)
    target_permissions = get_effective_permissions(target_participant, session)
    if target_participant.role != "admin":
        raise HTTPException(status_code=400, detail="Target is not an admin")
    assert_actor_strictly_outranks_target(
        actor_participant, target_participant, actor_permissions, target_permissions
    )

    target_participant.role = "member"
    target_participant.admin_permissions = {}
    target_participant.promoted_by = None
    target_participant.promoted_at = None

    session.add(target_participant)
    session.commit()
    await emit_chat_permissions_updated(chat_id, [target_participant.user_id])
    return {"ok": True}


@router.post("/chats/{chat_id}/leave")
async def leave_group_chat(
    chat_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = require_active_participant(session, chat_id, user_id)
    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.type != "group":
        raise HTTPException(status_code=403, detail="Only group chats can be left")
    if participant.role == "owner":
        raise HTTPException(
            status_code=403,
            detail="Transfer ownership before leaving this group",
        )

    participant.left_at = datetime.now(timezone.utc)
    participant.role = "member"
    participant.admin_permissions = {}
    participant.promoted_by = None
    participant.promoted_at = None
    session.add(participant)
    session.commit()

    remaining_participants = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()
    roles_by_user_id = {
        remaining_participant.user_id: remaining_participant.role
        for remaining_participant in remaining_participants
    }
    remaining_member_ids = list(roles_by_user_id.keys())
    chat_list_item = ChatListItem(
        id=chat_id,
        type=chat.type,
        title=chat.title,
        description=chat.description,
        avatar_url=chat.avatar_url,
        display_title=chat.title if chat.title is not None else "New group chat",
        display_avatar_url=chat.avatar_url or "/favicon.svg",
        member_ids=remaining_member_ids,
        member_count=len(remaining_member_ids),
        current_user_role=participant.role,
        last_message_id=None,
        last_message_text=None,
        last_message_sender_id=None,
        last_message_created_at=None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        pinned_order=None,
    )

    await sio.emit(
        "removed_from_chat",
        {
            "chat_id": chat_id,
            "removed_by": user_id,
            "left_by_self": True,
        },
        room=f"user:{user_id}",
    )

    for member_id in remaining_member_ids:
        member_chat_list_item = chat_list_item.model_copy(
            update={"current_user_role": roles_by_user_id[member_id]},
        )
        await sio.emit(
            "chat_members_updated",
            {
                "chat": member_chat_list_item.model_dump(mode="json"),
                "added_member_ids": [],
                "added_by": user_id,
                "removed_member_ids": [user_id],
                "removed_by": user_id,
            },
            room=f"user:{member_id}",
        )

    return {"ok": True}


@router.delete("/chats/{chat_id}/members/{user_id}")
async def remove_user(
    chat_id: int,
    user_id: int,
    session: SessionDep,
    actor_user: Annotated[User, Depends(get_current_user)],
):
    if actor_user.id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    if actor_user.id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Use the leave chat endpoint to leave a group",
        )

    actor_participant = require_chat_permission(
        session, chat_id, actor_user.id, "ban_users"
    )
    target_participant = require_active_participant(session, chat_id, user_id)

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    if chat.type != "group":
        raise HTTPException(
            status_code=403,
            detail="Users can only be removed from group chats",
        )

    if target_participant.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot remove owner")

    actor_permissions = get_effective_permissions(actor_participant, session)
    target_permissions = get_effective_permissions(target_participant, session)

    if target_participant.role != "member":
        assert_actor_strictly_outranks_target(
            actor_participant, target_participant, actor_permissions, target_permissions
        )

    target_participant.left_at = datetime.now(timezone.utc)
    target_participant.role = "member"
    target_participant.admin_permissions = {}
    target_participant.promoted_by = None
    target_participant.promoted_at = None

    session.add(target_participant)
    session.commit()

    remaining_participants = session.exec(
        select(ChatParticipant).where(
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()
    roles_by_user_id = {
        participant.user_id: participant.role for participant in remaining_participants
    }
    remaining_member_ids = list(roles_by_user_id.keys())

    chat_list_item = ChatListItem(
        id=chat_id,
        type=chat.type,
        title=chat.title,
        description=chat.description,
        avatar_url=chat.avatar_url,
        display_title=chat.title if chat.title is not None else "New group chat",
        display_avatar_url=chat.avatar_url or "/favicon.svg",
        member_ids=remaining_member_ids,
        member_count=len(remaining_member_ids),
        current_user_role=actor_participant.role,
        last_message_id=None,
        last_message_text=None,
        last_message_sender_id=None,
        last_message_created_at=None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        pinned_order=None,
    )

    await sio.emit(
        "removed_from_chat",
        {
            "chat_id": chat_id,
            "removed_by": actor_user.id,
        },
        room=f"user:{user_id}",
    )

    for member_id in remaining_member_ids:
        member_chat_list_item = chat_list_item.model_copy(
            update={
                "current_user_role": roles_by_user_id[member_id],
            }
        )
        await sio.emit(
            "chat_members_updated",
            {
                "chat": member_chat_list_item.model_dump(mode="json"),
                "added_member_ids": [],
                "added_by": actor_user.id,
                "removed_member_ids": [user_id],
                "removed_by": actor_user.id,
            },
            room=f"user:{member_id}",
        )

    return {"ok": True}
