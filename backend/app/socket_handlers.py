from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.db import engine
from app.dependencies import decode_access_token, get_cookie_from_environ
from app.models import Chat, ChatParticipant, Message, User
from app.rate_limit import message_rate_limiter
from app.services.chats import (
    assert_direct_chat_message_allowed,
    require_active_participant,
    require_chat_permission,
)
from app.services.messages import (
    build_message_reply_preview,
    get_reply_target,
    to_message_public,
)
from app.socket import sio


@sio.event
async def connect(sid, environ, auth):
    access_token = get_cookie_from_environ(environ, "access_token")

    if access_token is None:
        raise ConnectionRefusedError("Not authenticated")

    try:
        payload = decode_access_token(access_token)
        user_id = int(payload["sub"])
        token_expires_at = payload["exp"]
    except Exception:
        raise ConnectionRefusedError("Invalid token")

    with Session(engine) as session:
        user = session.get(User, user_id)

        if user is None:
            raise ConnectionRefusedError("User not found")

        display_name = (
            f"{user.first_name} {user.last_name}" if user.last_name else user.first_name
        )

        await sio.save_session(
            sid,
            {
                "user_id": user.id,
                "username": user.username,
                "display_name": display_name,
                "avatar_url": user.avatar_url,
                "token_expires_at": token_expires_at,
            },
        )

        await sio.enter_room(sid, f"user:{user.id}")


@sio.event
async def disconnect(sid, reason):
    if reason == sio.reason.CLIENT_DISCONNECT:
        print("the client disconnected")
    elif reason == sio.reason.SERVER_DISCONNECT:
        print("the server disconnected the client")
    else:
        print("disconnect reason:", reason)


@sio.event
async def join_room(sid, room):
    session = await sio.get_session(sid)
    user_id = session["user_id"]

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return {"ok": False, "error": "Session expired"}
    try:
        chat_id = int(room)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid room"}

    with Session(engine) as db:
        participant = db.exec(
            select(ChatParticipant).where(
                col(ChatParticipant.chat_id) == chat_id,
                col(ChatParticipant.user_id) == user_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).first()

        if participant is None:
            return {"ok": False, "error": "Not a participant"}

    await sio.enter_room(sid, str(chat_id))
    return {"ok": True}


@sio.event
async def leave_room(sid, room):
    session = await sio.get_session(sid)

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return
    try:
        chat_id = int(room)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid room"}

    await sio.leave_room(sid, str(chat_id))
    return {"ok": True}


async def emit_chat_activity(sid, data, event_name, activity):
    session = await sio.get_session(sid)
    user_id = session["user_id"]

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return {"ok": False, "error": "Session expired"}

    try:
        chat_id = int(data.get("chat_id"))
    except (AttributeError, TypeError, ValueError):
        return {"ok": False, "error": "Invalid chat"}

    is_active = data.get(activity)
    if not isinstance(is_active, bool):
        return {"ok": False, "error": f"Invalid {activity}"}

    with Session(engine) as db:
        try:
            require_active_participant(db, chat_id, user_id)
            chat = db.get(Chat, chat_id)
            if chat is None:
                return {"ok": False, "error": "Chat was not found"}
            assert_direct_chat_message_allowed(db, chat, user_id)
        except HTTPException as exc:
            return {"ok": False, "error": exc.detail}
        participant_ids = db.exec(
            select(col(ChatParticipant.user_id)).where(
                col(ChatParticipant.chat_id) == chat_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).all()

    activity_payload = {
        "chat_id": chat_id,
        "user_id": user_id,
        "username": session["username"],
        "display_name": session["display_name"],
        activity: is_active,
    }

    for participant_id in participant_ids:
        if participant_id == user_id:
            continue

        await sio.emit(
            event_name,
            activity_payload,
            room=f"user:{participant_id}",
        )

    return {"ok": True}


@sio.event
async def typing(sid, data):
    return await emit_chat_activity(sid, data, "typing", "is_typing")


@sio.event
async def recording_voice(sid, data):
    return await emit_chat_activity(
        sid,
        data,
        "recording_voice",
        "is_recording",
    )


@sio.event
async def message(sid, data):
    session = await sio.get_session(sid)
    sender_id = session["user_id"]
    sender_username = session["username"]
    sender_avatar_url = session["avatar_url"]

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return

    try:
        message_rate_limiter.hit_key(f"socket-message:{sender_id}")
    except HTTPException as exc:
        return {"ok": False, "error": exc.detail}

    content = data.get("content", "").strip()

    if not content:
        return {"ok": False, "error": "No content"}
    try:
        chat_id = int(data.get("chat_id"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid chat"}

    raw_reply_to_message_id = data.get("reply_to_message_id")
    try:
        reply_to_message_id = (
            int(raw_reply_to_message_id)
            if raw_reply_to_message_id not in {None, ""}
            else None
        )
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid reply target"}

    with Session(engine) as db:
        try:
            participant = require_chat_permission(
                db, chat_id, sender_id, "send_messages"
            )
            reply_target = get_reply_target(
                db,
                chat_id,
                sender_id,
                reply_to_message_id,
            )
        except HTTPException as exc:
            return {"ok": False, "error": exc.detail}

        if participant is None:
            return {"ok": False, "error": "Not a participant"}

        chat = db.get(Chat, chat_id)
        if chat is None:
            return {"ok": False, "error": "Chat was not found"}
        try:
            assert_direct_chat_message_allowed(db, chat, sender_id)
        except HTTPException as exc:
            return {"ok": False, "error": exc.detail}

        message = Message(
            chat_id=chat_id,
            sender_id=sender_id,
            content=content,
            message_type=data.get("message_type", "text"),
            reply_to_message_id=reply_target.id if reply_target else None,
        )

        db.add(message)
        db.flush()
        db.refresh(message)

        chat.last_message_id = message.id
        chat.updated_at = message.created_at

        db.commit()
        db.refresh(chat)
        db.refresh(message)

        participant_ids = db.exec(
            select(col(ChatParticipant.user_id)).where(
                col(ChatParticipant.chat_id) == chat_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).all()

        public_messages_by_participant = {}
        for participant_id in participant_ids:
            public_messages_by_participant[participant_id] = to_message_public(
                message,
                sender_username=sender_username,
                sender_avatar_url=sender_avatar_url,
                reply_to=build_message_reply_preview(db, message, participant_id),
            ).model_dump(mode="json", by_alias=True)

        public_message = public_messages_by_participant.get(sender_id)
        if public_message is None:
            return {"ok": False, "error": "Not a participant"}

    for participant_id, participant_message in public_messages_by_participant.items():
        if participant_id == sender_id:
            await sio.emit(
                "message",
                participant_message,
                room=f"user:{participant_id}",
                skip_sid=sid,
            )
        else:
            await sio.emit(
                "message",
                participant_message,
                room=f"user:{participant_id}",
            )

        await sio.emit(
            "chat_updated",
            {
                "chat_id": chat_id,
                "last_message": participant_message,
            },
            room=f"user:{participant_id}",
        )

    return {
        "ok": True,
        "message": public_message,
    }
