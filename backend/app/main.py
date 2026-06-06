import re

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pwdlib import PasswordHash
from sqlmodel import Session, col, select

from app.db import SessionDep, engine
from app.models import (
    LoginRequest,
    Message,
    MessagePublic,
    User,
    UserCreate,
    UserPublic,
)

# FastAPI app
fastapi_app = FastAPI()
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

password_hash = PasswordHash.recommended()


def verify_password(plain_password, hashed_password):
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password):
    return password_hash.hash(password)


def is_valid_username(s: str) -> bool:
    pattern = r"^[a-z0-9_]+$"
    return re.fullmatch(pattern, s) is not None


def serialize_message(message: Message, sender_username: str | None = None):
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": sender_username,
        "content": message.content,
        "message_type": message.message_type,
        "reply_to_message_id": message.reply_to_message_id,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "updated_at": message.updated_at.isoformat() if message.updated_at else None,
        "edited_at": message.edited_at.isoformat() if message.edited_at else None,
        "deleted_at": message.deleted_at.isoformat() if message.deleted_at else None,
        "is_pinned": message.is_pinned,
        "metadata": message.metadata_,
    }


@fastapi_app.get("/rooms/{conversation_id}/messages", response_model=list[MessagePublic])
def get_room_messages(conversation_id: int, session: SessionDep):
    messages = session.exec(
        select(Message).where(Message.conversation_id == conversation_id)
    ).all()
    sender_ids = {message.sender_id for message in messages if message.sender_id is not None}
    users = (
        session.exec(select(User).where(col(User.id).in_(sender_ids))).all()
        if sender_ids
        else []
    )
    usernames_by_id = {user.id: user.username for user in users}

    return [
        serialize_message(message, usernames_by_id.get(message.sender_id))
        for message in messages
    ]


@fastapi_app.post("/login", response_model=UserPublic)
def login(payload: LoginRequest, session: SessionDep):
    # look up user in users.db
    stmt = select(User).where(User.username == payload.username)
    existing_user = session.exec(stmt).first()
    if existing_user is None:
        raise HTTPException(status_code=409, detail="Username not registered")

    # validate password
    if not verify_password(payload.password, existing_user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return existing_user


@fastapi_app.post("/signup", response_model=UserPublic)
def signup(user_create: UserCreate, session: SessionDep):
    # check if username is valid
    if not user_create.username:
        return HTTPException(status_code=400, detail="Username is invalid")
    if len(user_create.username) < 5:
        return HTTPException(
            status_code=400, detail="Username must be at least 5 characters"
        )
    if len(user_create.username) > 32:
        return HTTPException(
            status_code=400, detail="Maximum username length is 32 characters"
        )
    if not is_valid_username(user_create.username.lower()):
        return HTTPException(
            status_code=400,
            detail="Username can include only a-z, 0-9, and underscores.",
        )

    # check if user already exists
    stmt = select(User).where(User.username == user_create.username)
    existing_user = session.exec(stmt).first()
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="Username already registered")

    # check if password is strong enough
    if len(user_create.password) < 8:
        return HTTPException(status_code=400, detail="Password is too short")

    # create new user
    db_user = User.model_validate(
        user_create,
        update={
            "username": user_create.username.lower(),
            "password_hash": get_password_hash(user_create.password),
        },
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    return db_user


# Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=["http://localhost:5173"],
)


@sio.event
async def connect(sid, environ, auth):
    print("Client connected: %s", sid)


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
    if not room:
        return
    await sio.enter_room(sid, room)


@sio.event
async def leave_room(sid, room):
    if not room:
        return
    await sio.leave_room(sid, room)


@sio.event
async def message(sid, data):
    content = data.get("content", "").strip()
    conversation_id = data.get("conversation_id")
    sender_id = data.get("sender_id")

    if not content or not conversation_id:
        return

    with Session(engine) as session:
        message = Message(
            conversation_id=conversation_id,
            sender_id=sender_id,
            content=content,
            message_type=data.get("message_type", "text"),
            reply_to_message_id=data.get("reply_to_message_id"),
        )

        session.add(message)
        session.commit()
        session.refresh(message)
        sender = session.get(User, sender_id) if sender_id is not None else None

    await sio.emit(
        "message",
        serialize_message(message, sender.username if sender else None),
        room=str(conversation_id),
        skip_sid=sid,
    )


# Final ASGI app: Socket.IO + FastAPI
app = socketio.ASGIApp(sio, fastapi_app)
