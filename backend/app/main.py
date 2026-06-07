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

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is not set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


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
    usernames_by_id = {user.id: user.username for user in users}

    return [
        serialize_message(message, usernames_by_id.get(message.sender_id))
        for message in messages
    ]


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
    session = await sio.get_session(sid)
    sender_id = session["user_id"]
    sender_username = session["username"]

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
        serialize_message(message, sender_username),
        room=str(conversation_id),
        skip_sid=sid,
    )


# Final ASGI app: Socket.IO + FastAPI
app = socketio.ASGIApp(sio, fastapi_app)
