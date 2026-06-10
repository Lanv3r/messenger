import os
import re
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from typing import Annotated

import jwt
import socketio
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pwdlib import PasswordHash
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.db import SessionDep, engine
from app.models import (
    Conversation,
    ConversationListItem,
    ConversationParticipant,
    DirectMessageCreate,
    DirectMessageResponse,
    LoginRequest,
    Message,
    MessagePublic,
    User,
    UserCreate,
    UserProfileUpdate,
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

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is not set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
SAVED_MESSAGES_AVATAR_URL = "data:image/png;base64,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"


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    session: SessionDep, access_token: str | None = Cookie(default=None)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    if access_token is None:
        raise credentials_exception
    try:
        payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except Exception:
        raise credentials_exception
    user = session.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user


password_hash = PasswordHash.recommended()


def verify_password(plain_password, hashed_password):
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password):
    return password_hash.hash(password)


def is_valid_username(s: str) -> bool:
    pattern = r"^[a-z0-9_]+$"
    return re.fullmatch(pattern, s) is not None


def get_cookie_from_environ(environ: dict, key: str) -> str | None:
    cookie_header = environ.get("HTTP_COOKIE")

    if not cookie_header:
        scope = environ.get("asgi.scope", {})
        headers = scope.get("headers", [])
        for name, value in headers:
            if name == b"cookie":
                cookie_header = value.decode()
                break

    if not cookie_header:
        return None

    cookie = SimpleCookie()
    cookie.load(cookie_header)

    if key not in cookie:
        return None

    return cookie[key].value


def serialize_message(
    message: Message,
    sender_username: str | None = None,
    sender_avatar_url: str | None = None,
):
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": sender_username,
        "sender_avatar_url": sender_avatar_url,
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


@fastapi_app.get("/users/username-availability")
def check_username_availability(username: str, session: SessionDep):
    normalized_username = username.strip().lower()

    if not normalized_username:
        return {
            "available": False,
            "message": "Username is required.",
        }
    if len(normalized_username) < 5:
        return {
            "available": False,
            "message": "Username must be at least 5 characters.",
        }
    if len(normalized_username) > 32:
        return {
            "available": False,
            "message": "Username must be at most 32 characters.",
        }
    if not is_valid_username(normalized_username):
        return {
            "available": False,
            "message": "Username can include only a-z, 0-9, and underscores.",
        }
    user = session.exec(
        select(User).where(User.username == normalized_username)
    ).first()
    if user is not None:
        return {
            "available": False,
            "message": "Username is already taken.",
        }
    return {
        "available": True,
        "message": "Username is available.",
    }


@fastapi_app.get("/users/by-username/{username}", response_model=UserPublic)
def get_user_by_username(
    username: str,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    normalized_username = username.strip().lower()
    user = session.exec(
        select(User).where(User.username == normalized_username)
    ).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@fastapi_app.get("/users/me/", response_model=UserPublic)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@fastapi_app.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}


@fastapi_app.get(
    "/rooms/{conversation_id}/messages",
    response_model=list[MessagePublic],
)
def get_room_messages(
    conversation_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    messages = session.exec(
        select(Message).where(Message.conversation_id == conversation_id)
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

    serialized_messages = []

    for message in messages:
        sender = users_by_id.get(message.sender_id)

        serialized_messages.append(
            serialize_message(
                message,
                sender.username if sender else None,
                sender.avatar_url if sender else None,
            )
        )

    return serialized_messages


@fastapi_app.post("/login", response_model=UserPublic)
def login(payload: LoginRequest, response: Response, session: SessionDep):
    # look up user in users.db
    stmt = select(User).where(User.username == payload.username.lower())
    user = session.exec(stmt).first()
    # validate login
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    # create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    # set HttpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # True in production with HTTPS
        samesite="lax",  # "none" only if cross-site + HTTPS
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return user


@fastapi_app.post("/signup", response_model=UserPublic)
def signup(user_create: UserCreate, response: Response, session: SessionDep):
    # check if username is valid
    if not user_create.username:
        raise HTTPException(status_code=400, detail="Username is invalid")
    if len(user_create.username) < 5:
        raise HTTPException(
            status_code=400, detail="Username must be at least 5 characters"
        )
    if len(user_create.username) > 32:
        raise HTTPException(
            status_code=400, detail="Maximum username length is 32 characters"
        )
    if not is_valid_username(user_create.username.lower()):
        raise HTTPException(
            status_code=400,
            detail="Username can include only a-z, 0-9, and underscores.",
        )

    # check if first name is valid
    if user_create.first_name is not None and len(user_create.first_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="First name must be at most 64 characters.",
        )

    # check if last name is valid
    if user_create.last_name is not None and len(user_create.last_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="Last name must be at most 64 characters.",
        )

    # chek if bio is valid
    if user_create.bio is not None and len(user_create.bio.strip()) > 70:
        raise HTTPException(
            status_code=400,
            detail="Bio must be at most 70 characters.",
        )

    # check if user already exists
    stmt = select(User).where(User.username == user_create.username.lower())
    existing_user = session.exec(stmt).first()
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="Username already registered")

    # check if password is strong enough
    if len(user_create.password) < 8:
        raise HTTPException(status_code=400, detail="Password is too short")

    # create new user
    user = User.model_validate(
        user_create,
        update={
            "username": user_create.username.lower(),
            "password_hash": get_password_hash(user_create.password),
        },
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # create a self chat
    if user.id is None:
        raise HTTPException(status_code=500, detail="User creation failed")

    self_chat = Conversation(
        type="self",
        title="Saved Messages",
        description=None,
        avatar_url=SAVED_MESSAGES_AVATAR_URL,
    )

    session.add(self_chat)
    session.commit()
    session.refresh(self_chat)

    if self_chat.id is None:
        raise HTTPException(status_code=500, detail="Self Chat creation failed")

    session.add(
        ConversationParticipant(
            conversation_id=self_chat.id,
            user_id=user.id,
            role="owner",
        )
    )

    session.commit()

    # create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    # set HttpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # True in production with HTTPS
        samesite="lax",  # "none" only if cross-site + HTTPS
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return user


@fastapi_app.patch("/users/me/", response_model=UserPublic)
def update_me(
    payload: UserProfileUpdate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    update_data = payload.model_dump(exclude_unset=True)

    first_name = update_data.get("first_name", None)
    last_name = update_data.get("last_name", None)
    bio = update_data.get("bio", None)

    # check if first name is valid
    if first_name is not None and len(first_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="First name must be at most 64 characters.",
        )

    # check if last name is valid
    if last_name is not None and len(last_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="Last name must be at most 64 characters.",
        )

    # chek if bio is valid
    if bio is not None and len(bio.strip()) > 70:
        raise HTTPException(
            status_code=400,
            detail="Bio must be at most 70 characters.",
        )

    for key, value in update_data.items():
        setattr(current_user, key, value)

    current_user.updated_at = datetime.now(timezone.utc)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return current_user


@fastapi_app.get("/conversations", response_model=list[ConversationListItem])
def get_conversations(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    conversation_ids = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == current_user_id,
        col(ConversationParticipant.left_at).is_(None),
    )
    conversations = session.exec(
        select(Conversation).where(col(Conversation.id).in_(conversation_ids))
    ).all()
    result = []

    for conversation in conversations:
        display_title = conversation.title
        display_avatar_url = conversation.avatar_url
        other_user_id = None

        if conversation.type == "self":
            display_title = "Saved Messages"
            display_avatar_url = SAVED_MESSAGES_AVATAR_URL

        elif conversation.type == "direct":
            other_participant = session.exec(
                select(ConversationParticipant).where(
                    ConversationParticipant.conversation_id == conversation.id,
                    ConversationParticipant.user_id != current_user_id,
                    col(ConversationParticipant.left_at).is_(None),
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

        if conversation.id is None or conversation.created_at is None:
            raise HTTPException(
                status_code=500,
                detail="Conversation was not fetched correctly",
            )

        last_message = session.exec(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(col(Message.created_at).desc())
        ).first()

        result.append(
            ConversationListItem(
                id=conversation.id,
                type=conversation.type,
                title=conversation.title,
                description=conversation.description,
                avatar_url=conversation.avatar_url,
                display_title=display_title or "Conversation",
                display_avatar_url=display_avatar_url,
                other_user_id=other_user_id,
                last_message_id=last_message.id if last_message else None,
                last_message_text=last_message.content if last_message else None,
                last_message_sender_id=last_message.sender_id if last_message else None,
                last_message_created_at=last_message.created_at
                if last_message
                else None,
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
            )
        )

    return result


@fastapi_app.post("/messages/direct", response_model=DirectMessageResponse)
def create_direct_message(
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
        conversation = session.exec(
            select(Conversation)
            .join(
                ConversationParticipant,
                col(ConversationParticipant.conversation_id) == col(Conversation.id),
            )
            .where(
                Conversation.type == "self",
                ConversationParticipant.user_id == sender_id,
            )
        ).first()
    else:
        participant_ids = [sender_id, payload.recipient_id]
        matching_conversation_ids = (
            select(col(ConversationParticipant.conversation_id))
            .where(col(ConversationParticipant.user_id).in_(participant_ids))
            .group_by(col(ConversationParticipant.conversation_id))
            .having(func.count(col(ConversationParticipant.user_id)) == 2)
        )

        conversation = session.exec(
            select(Conversation).where(
                Conversation.type == "direct",
                col(Conversation.id).in_(matching_conversation_ids),
            )
        ).first()

        if conversation is None:
            conversation = Conversation(
                type="direct",
                title=None,
                description=None,
                avatar_url=recipient.avatar_url,
            )

            session.add(conversation)
            session.commit()
            session.refresh(conversation)

            if conversation.id is None:
                raise HTTPException(
                    status_code=500,
                    detail="Conversation was not created correctly",
                )

            session.add(
                ConversationParticipant(
                    conversation_id=conversation.id,
                    user_id=sender_id,
                    role="member",
                )
            )
            session.add(
                ConversationParticipant(
                    conversation_id=conversation.id,
                    user_id=payload.recipient_id,
                    role="member",
                )
            )

            session.commit()

        if conversation.id is None:
            raise HTTPException(
                status_code=500,
                detail="Conversation was not fetched correctly",
            )
        message = Message(
            conversation_id=conversation.id,
            sender_id=sender_id,
            content=content,
            message_type="text",
        )
        session.add(message)
        session.commit()
        session.refresh(message)
        session.refresh(conversation)

        return {
            "conversation": ConversationListItem(
                id=conversation.id,
                type=conversation.type,
                title=conversation.title,
                description=conversation.description,
                avatar_url=conversation.avatar_url,
                display_title=(
                    "Saved Messages"
                    if conversation.type == "self"
                    else (
                        f"{recipient.first_name} {recipient.last_name}"
                        if recipient.last_name
                        else recipient.first_name
                    )
                ),
                display_avatar_url=(
                    current_user.avatar_url
                    if conversation.type == "self"
                    else recipient.avatar_url
                ),
                other_user_id=None if conversation.type == "self" else recipient.id,
                last_message_id=message.id,
                last_message_text=message.content,
                last_message_sender_id=message.sender_id,
                last_message_created_at=message.created_at,
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
            ),
            "message": serialize_message(
                message,
                current_user.username,
                current_user.avatar_url,
            ),
        }


# Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=["http://localhost:5173"],
)


@sio.event
async def connect(sid, environ, auth):
    access_token = get_cookie_from_environ(environ, "access_token")

    if access_token is None:
        raise ConnectionRefusedError("Not authenticated")

    try:
        payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
        token_expires_at = payload["exp"]
    except Exception:
        raise ConnectionRefusedError("Invalid token")

    with Session(engine) as session:
        user = session.get(User, user_id)

        if user is None:
            raise ConnectionRefusedError("User not found")

        await sio.save_session(
            sid,
            {
                "user_id": user.id,
                "username": user.username,
                "avatar_url": user.avatar_url,
                "token_expires_at": token_expires_at,
            },
        )


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

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return
    if not room:
        return
    await sio.enter_room(sid, room)


@sio.event
async def leave_room(sid, room):
    session = await sio.get_session(sid)

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return
    if not room:
        return
    await sio.leave_room(sid, room)


@sio.event
async def message(sid, data):
    session = await sio.get_session(sid)
    sender_id = session["user_id"]
    sender_username = session["username"]
    sender_avatar_url = session["avatar_url"]

    if datetime.now(timezone.utc).timestamp() >= session["token_expires_at"]:
        await sio.disconnect(sid)
        return

    content = data.get("content", "").strip()
    conversation_id = data.get("conversation_id")

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

    await sio.emit(
        "message",
        serialize_message(message, sender_username, sender_avatar_url),
        room=str(conversation_id),
        skip_sid=sid,
    )


# Final ASGI app: Socket.IO + FastAPI
app = socketio.ASGIApp(sio, fastapi_app)
