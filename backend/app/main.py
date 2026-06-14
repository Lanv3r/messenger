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
from sqlmodel import Session, col, exists, select

from app.db import SessionDep, engine
from app.models import (
    AddGroupMembers,
    Chat,
    ChatListItem,
    ChatMemberPublic,
    ChatParticipant,
    ChatReadRequest,
    ChatSettingsUpdate,
    DirectMessageCreate,
    DirectMessageResponse,
    GroupCreate,
    LoginRequest,
    Message,
    MessageCreate,
    MessageDeletion,
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
SAVED_MESSAGES_AVATAR_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAA5FBMVEVkqt3////+/vz9/vpmqttjqt1rr9yVwOJcqthlp+Njrdxlpt1jqtX6/v1mqNz8//v19vrY6fRjrdWcxeRVpN9lqdb9/vdnqNhop9thquD/+/T9/fNdrOPY6vP++/ljqtZqqM9jodDx+fdaruP//e1wp9SDudyUu9jK3Ovx9/aew9yvy+DJ1dt2rs5Tpubs8u3B3eiHr9aiwc+tzde73OqFsMhssNHh7/B3psqZudC40+eOtNK90NzW4+h7tNfX7/NqnsS21dnW4fDH4+WUw9Vwoc95ssypxNWlwdeTvsmBqsKHvtjfb/NoAAAN1ElEQVR4nO2dDXPTOBPHbUtqayuSS55YimLHTlwChJLQQjmXQinHca98/+/z7MpOX6D04HCchtF/phkoGcc/72p3ZYddz3NycnJycnJycnJycnJycnJycnJycnJycnJycnJy+kYxkITXhLG2jgc/xngtHe/HRZkngVFzT7YlhJM1odw0HojpROuEskS2czbWhlJrbY+3eUI4A2kkM+ik7XkVeClrjr5xSY+akDF4QdZWXJQCoUHJlrziBwE9qjUPJU36lNEWxKIoonBM66awHGE9Sq9N//h+gUfJmR7y+rr/uDiHFziYpFQaJGN4GenmAA1ca2N6k0f/a1m7Mw0hmspIbsqGuGLAnbyMJpPHT+Y5Ue0qnp8/3Rkw6lH4JEiPGyFk6KFDeTgPlCKBaFFxHIuA+OLZYsl3NhVx4MIyk8jBo+eqjEkQiCAgLSgA+T685HBIEYsnNISiApy065VoP8+wwfRIkBjPzCdwYm1KCLhogqhqYTI61LprQma4puxgcQ5ggQqC+tK3rYAIMSqfahn1vK5jjaQFj/jxvoiVAAP6awH0wTGET8oX0gyjrGNE5vEi3KtGOYlFXC+ddRDigdVIfJLDpPNoytis+EAEwgUYSslajAhLkQSxXy1CKru0IcVC5mD6UvgKjUcwlIJD5UFLiuuU4UPGQPcXufptCmG7Q0JklMtFLgTGGaLgjOBqN2ZsKR3GNSEekQT75Omg6JIPrqaO2EmqhF0qBBjL0agxYQsZkZA8z1UgYmJXNyz1UTUpJJaoHbpq9EqkRDTRADyJlOX5eHw+fvDDGtsfIXLwh3oxEpLGhwnrkJB6nMlnkAZFExCIEueL/mC5HPy4lgO2lw3YLy/nJGh8BPyUVDMDZWI3ewwo+DUzkzmuuTpLkFH8iSeTRCe9pIUtIpShkvbYaZWmyiZaWJlEvBoU1CSd2FAyNvTkriK1E+FKKV8PQk+G3F6AHxQcAjaGWdTji0pdxVfxFjYxXRFSNizCM/Ce2NYykDMOQxqZNvAsIYuoZ+TEsNfxtRRSQZ3fESFgDHuDc5uq8CcO5pNlMmn7Uw5Cw0+CpiIEzWeDntGdEEJAkxEtLwmJOmTZZNZyVcUy/ovZhWTfEPrkUTbJPN3up3xFUjKzo/IVYaB2TVK0XTbSyTALT+fByIYzeAl2sx4zHRF6hemTuizGWD6n3qz1BSI1WxbTBwGpY5klpLSjdCi9Hu/jnr62oT+PGI/aLqoM5D59MMZKcEXIeBJ1VZwyvgMxwFbd8LLfk7zPW7++lPG98dWeJdjdC4uOCJlHgTDujFBcEnZmQ9hZXLNhsN8zYd+0TCiBUO7BOrxOWES81Q/5qm4Sxvt9vhZCuiIUK8Lez0roO8LW5QjbkCNcr356QvbTE/78NnSErcgRrleOsA05wvXqpyd0Gb8VOcL1yhG2IUe4XjnCNuQI1yqX8VuRI1yvHGEbcoTrlSNsQ45wrXIZvxU5wvXKEbYhR7heOcI25AjXKpfxW5EjXK8cYRtyhOuVI2xDjnCtchm/FTnC9coRtiFHuF45wjbkCNcql/Fb0TYSXmsp0PzlrndvI6GUkvP6v3wz1vRIvOPd20mIXS+iax0k73r3lhGuepIYw6Vtkvmvn7FthLa/G+vBe3jTBhEseGeTgq0jlNhZ1ouox7lsgszdXRi2jpAzXIS29erAGKb/1VG3LOMzPOOEG316eHZ2djzV2FESY87XtVU2ZB5NqGQ0nH4sVT5KxclkmWnOkrvaeGwVIfUM7bFMnh6JUR4Ln6jqzdS2yb5DW0UIMcZ4TD+uCAG8IFB5IN7qzNxZ1GwPIY0gBWqeTd7GYt/2fRJ+rFRw/o5piQ5sbm9qvRWE1JgEwhKHGi18dBGnaVz3XsX2q7ko/xpkM8kK7Ox1y2dsBWFiONgo4lGmXwglysu+ViQW2KfvZALlKeAbyb7sMLsVhKYoQt7TbDB7QvIcPPOy75JtwTZ6+PwRC3UE1QCVw88X5VYQQo433tDsvaqCuBQqVeSSEGIOEYLkR3tGD2UUfemo9z3j27EG8JIkbPLMh+hp36zqRsgWkyglAuWf72RRQm/pZn3fbVjXnoUMk8WHQKjct82esCFSHK+aoGGTYEHKp+ygbg1+syfi/SY02JfPhF7Cpocl5EBgqZs9EewbDVwBIgv7CxKcJJBOdPJZR+t7TcgMpbiD6IezB7XpGj7l+zl2qoVY6tfCf0qrRwP0UpyGcHWV7jUh1C80Y1Tzj/M8D64IwZSQBwX+Lr4kBOjR/BBNSDVl20BI7e4Wcr2enohReqN9MgTQ8uOrMfgosb+vA6svyMNqwViU4BSQ1WpsCMm9I6RImETJcLmoUmwbfw0xUOrBO7Y3eSLIqvWqjawqEGn5dGpYaG4QsvtDaLuZeQ0hIGov43+WsR80lmq8MS7fvs/YMBw8no8wJcYxNtAFgjgXI3U02SsgPiWNL2CXVvl5v7aNEUJxnUCUsFkbtn2zLJuM43S/sRyx6U/EafVqajIjqZGLc2yHSPzY9kC1PWaJqI55X4e039xxTMLIsIt7kvEtoZ0lYvvtJ+xNleZCXMaSQOEohycLk2XeENJ7tOSwF4Z/iev1iL278zQgvyZGGzasjVjwyOxtiPALGxaM94w9MUmLcMnejjBq1vES2x3npITMPk0o15PZkGW9iTFvnhOhFFl5sQ9/VOrD4gAuQYIfAabucTa+J4S9mhAb5BrG31yQkb8fNzEGe6tCYLl4M8hwsFcB+ymImtrw6VsVk+AqlYAlIW88TaSh4BIFEPbvCyEBG4aWkEH4m70QI6xaAn+V1cE85ctplJhm3JiUMmOSZvJ1he/LgzoUQR0OBk/PZhoIe2C/+0Foe13XXsq9pBexyZFQmAaagsUGynz/9dBQvUoE2M/ajjLjv58rbDGrmqxhO5+L8RvGw6g35BQJ88tLtVFCiDQ9CJLaTF9VcfMPPhbZUGVDnfbbDAfiXNUr+CcjIb9ns5fPRwJHnPirvSOkyvJsJg/YkCf9MKsJN9kZEs+MzAuPF2bGl+ZMpUGzj8AQSRROFHixl+kigr08X20CsSigWUZn3vJdlY58bIfcWB2KcqXOj1nEMzrh2b2woQAbSt2DMu3d+QjLMWGnsuBJ5bCPeH5qZjQzn9+lMJ7WuCvkw6M0LQVRl26NgwjKw6k5wFuqY4zI94DQhLLIeoclJkGcCEGaagZO/KzHjeaRpvzmbXwofKhhOuozeVyNVsVBPdsiEHlw9L4fehoIySYI2XVC7JRcUJ6cVvZESN0I39oijceP2HKYHHy+u0XBXsmzpbZHJyd4SwNJYE0qOz4n8MvXU2+49yCPN+6lgcqfMz74WGFqh9TR5AcoV4g6+j0zWheYJW+daQD5kUpJvelZCduqYBVQbRkwEmfv9cEYc+Zm8yHmgzKc/po3W75gRUiwioHKEsfD3TKNCp+14XNEDcWe7A2OxyRWl0HYKk0vJoMPCuf0bDbjQ7Cc/1H5SlxN0gn8ffFwdP4OH6Pd+WwCXRQNHAHkUSzi0bVxPAFUfuXTc1yYGyW0A0rIfFT6Ql0zAATRE6mHSS+58zj1uNHEhBmV0905RpgrQiB7CDsw3IBs1ktxMkyZlzmpCQVGGT+udgdF0Uv0N3zJRjKtGZvRwfE5xOGrqyRwVl26r1bjzrrsWH7DSzEBxjlJbS1q86Dw1ZMJ7GQzfOD7DYRelEiemZlJ/izrKFMfB7Op8le5dVOEflM2Y5awt3sBNJ0/1mb1mP7fCZmd/AvVdpTJPyq1j5stnMMXrJKPf0W4gZ7sl7IJEOK6yB+OZ9l/GAWRUMYlm731H0LOhxTxxQywFWEX4xHYrYSYp0cqjQ/ZMvruKRRM6sj0izDr/71vbzgStUlCTG87wc0zsA46GpHq8SD7/T/MucOpILPeARRqk4v04ehGzLlOyDshhDKa7XzhRTnsC+KTmUxkNrw7SdwuqG34ngyjbHq4T+JmztKGbGgJ46AenLeK7fgFBPKXXIIHc/r98QAK18RA5oA9R2TeXeQjm4iCDRGCl9IdIpRQ/mqW3H4OdejFqW4l1Bl6eiRyOKy65qrE32Umur2+bV9gwxlkKp+sCKES9cu3ejlI/ot/fi5Io/pTZZ+9XSHG/q6WSUeEhjKGNrwkhGudVsdTOLF2bKhlaE6fqPR6vAkIEnY1yJIysyOuEYpYPZkyOaQtDUNPtDGD6Zm6kTGCXSpbn7n0NYEN2RwrqmYv789fTjMjIVLwNhAli/oTbQbvxtfDaXDMTFeE0kRy7wXU/ALTvJ+K8UIPM9PabEIWRYxR2HJMntmJlni3TeUPht2N54Za2WSLiqQKv25AyNF7Y4amxemL9TfepUenj+cQbABSqfJv7nmdEULyyug/F7FSQFl9mprMS+w3ZFsTElLJsmXyDHZnKn0o3oQR627WKkSUhHmTv8bzqjo8zTLD2h+dh/c5qDTL5GlVzsujhRywluLYt0gyrM0yPTldTExGtU4SGrb8GfiEQ3t6Ro0+/WfBsqjXnZPaOaQJbm8Nw/PAsll7bRPa4tCw3pCCixRRxocdj5A3eCNw9cUCvPe5nsuLhtRZqGft5KHvEbVsbHUjm60nCuCtKnyMQ/WXXwvrXuwb/pvIdwtiDQSc+nu2G1e0Dj+FjbEtg7uLMXdoLWfBvQK2jN0VM3dqLSdhbnkg8PPpPpjPycnJycnJycnJycnJycnJycnJycnJycnJycnp59D/AeWbl4lmkeflAAAAAElFTkSuQmCC"


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


def to_message_public(
    message: Message,
    sender: User | None = None,
    sender_username: str | None = None,
    sender_avatar_url: str | None = None,
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
        is_pinned=message.is_pinned,
    )


def get_active_participant(
    session: Session,
    chat_id: int,
    user_id: int,
) -> ChatParticipant:
    participant = session.exec(
        select(ChatParticipant).where(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id == user_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).first()

    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    return participant


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
    get_active_participant(session, chat_id, current_user_id)

    messages = session.exec(select(Message).where(Message.chat_id == chat_id)).all()
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
        public_messages.append(to_message_public(message, sender))

    return public_messages


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

    self_chat = Chat(
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
        ChatParticipant(
            chat_id=self_chat.id,
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


@fastapi_app.get("/chats", response_model=list[ChatListItem])
def get_chats(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    rows = session.exec(
        select(ChatParticipant, Chat)
        .join(Chat, col(Chat.id) == ChatParticipant.chat_id)
        .where(
            ChatParticipant.user_id == current_user_id,
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
                    ChatParticipant.chat_id == chat.id,
                    ChatParticipant.user_id != current_user_id,
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
        else:
            member_ids = list(
                session.exec(
                    select(ChatParticipant.user_id).where(
                        ChatParticipant.chat_id == chat.id,
                        col(ChatParticipant.left_at).is_(None),
                    )
                ).all()
            )
            member_count = len(member_ids)
            current_user_role = current_participant.role

        last_message = session.exec(
            select(Message)
            .where(
                Message.chat_id == chat.id,
                col(Message.deleted_at).is_(None),
            )
            .order_by(col(Message.created_at).desc())
        ).first()

        if last_message is None and chat.type not in {"self", "group"}:
            continue

        last_read_message_id = (
            current_participant.last_read_message_id if current_participant else None
        )

        unread_statement = select(func.count(col(Message.id))).where(
            Message.chat_id == chat.id,
            Message.sender_id != current_user_id,
            col(Message.deleted_at).is_(None),
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
                member_ids=member_ids,
                member_count=member_count,
                current_user_role=current_user_role,
                last_message_id=last_message.id if last_message else None,
                last_message_text=last_message.content if last_message else None,
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
            )
        )
    result.sort(
        key=lambda chat: (
            chat.is_pinned,
            chat.last_message_created_at or chat.created_at,
        ),
        reverse=True,
    )
    return result


@fastapi_app.post("/messages/direct", response_model=DirectMessageResponse)
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
            Chat.type == "direct",
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

    # update chat
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
        ),
        "message": public_message,
    }


@fastapi_app.post("/messages/{chat_id}", response_model=MessagePublic)
async def create_message(
    chat_id: int,
    payload: MessageCreate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    sender_id = current_user.id
    if sender_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = get_active_participant(session, chat_id, sender_id)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(
            status_code=500,
            detail="Chat was not found",
        )

    message = Message(
        chat_id=chat_id,
        sender_id=sender_id,
        content=content,
        message_type="text",
    )

    session.add(message)
    session.flush()
    session.refresh(message)

    # update chat
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

    participant_ids = session.exec(
        select(ChatParticipant.user_id).where(
            ChatParticipant.chat_id == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    for participant_id in participant_ids:
        await sio.emit(
            "chat_updated",
            chat_update,
            room=f"user:{participant_id}",
        )

    return public_message


@fastapi_app.post("/chats/{chat_id}/read")
async def chat_read(
    chat_id: int,
    payload: ChatReadRequest,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    participant = get_active_participant(session, chat_id, user_id)
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
        select(ChatParticipant.user_id).where(
            ChatParticipant.chat_id == chat_id,
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


@fastapi_app.get("/chats/{chat_id}/members", response_model=list[ChatMemberPublic])
def get_chat_members(
    chat_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    participant = get_active_participant(session, chat_id, user_id)

    participants = session.exec(
        select(ChatParticipant).where(
            ChatParticipant.chat_id == chat_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).all()

    members = []

    for member in participants:
        member_user = session.get(User, member.user_id)
        if member_user is None:
            raise HTTPException(status_code=404, detail="User not found")

        chat_member = ChatMemberPublic(
            user_id=member.user_id,
            username=member_user.username,
            first_name=member_user.first_name,
            last_name=member_user.last_name,
            avatar_url=member_user.avatar_url,
            status=member_user.status,
            role=member.role,
            joined_at=member.joined_at,
            added_by=member.added_by,
        )
        members.append(chat_member)

    return members


@fastapi_app.patch("/chats/{chat_id}/settings")
def pin_chat(
    chat_id: int,
    payload: ChatSettingsUpdate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")
    participant = get_active_participant(session, chat_id, user_id)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(participant, key, value)
    session.add(participant)
    session.commit()
    session.refresh(participant)

    return {
        "ok": True,
        "chat_id": chat_id,
        "is_pinned": participant.is_pinned,
        "is_archived": participant.is_archived,
        "muted_until": participant.muted_until,
    }


@fastapi_app.post("/chats/group", response_model=ChatListItem)
async def create_group_chat(
    payload: GroupCreate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    chat = Chat(
        type="group",
        title=payload.title,
        description=payload.description,
        avatar_url=payload.avatar_url,
    )
    session.add(chat)
    session.flush()

    if chat.id is None:
        raise HTTPException(status_code=500, detail="Chat was not created")

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
        display_title=payload.title,
        member_ids=member_ids,
        member_count=len(member_ids),
        current_user_role="owner",
        last_message_id=None,
        last_message_text=None,
        last_message_sender_id=None,
        last_message_created_at=None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
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


@fastapi_app.post("/chats/{chat_id}/members")
async def add_group_members(
    chat_id: int,
    payload: AddGroupMembers,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user")

    participant = get_active_participant(session, chat_id, user_id)

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
            ChatParticipant.chat_id == chat_id,
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
        member_ids=all_member_ids,
        member_count=len(all_member_ids),
        current_user_role=participant.role,
        last_message_id=None,
        last_message_text=None,
        last_message_sender_id=None,
        last_message_created_at=None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
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


@fastapi_app.get(
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
    participant = get_active_participant(session, chat_id, user_id)

    normalized_query = query.strip()
    if not normalized_query:
        return []

    messages = session.exec(
        select(Message)
        .where(
            Message.chat_id == chat_id,
            col(Message.deleted_at).is_(None),
            col(Message.content).ilike(f"%{normalized_query}%"),
            ~exists().where(
                col(MessageDeletion.message_id) == col(Message.id),
                col(MessageDeletion.user_id) == user_id,
            ),
        )
        .order_by(col(Message.created_at).desc())
        .limit(50)
    ).all()

    public_messages = []

    for message in messages:
        sender = session.get(User, message.sender_id)

        public_messages.append(to_message_public(message, sender))

    return public_messages


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
                ChatParticipant.chat_id == chat_id,
                ChatParticipant.user_id == user_id,
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

    if not content:
        return {"ok": False, "error": "No content"}
    try:
        chat_id = int(data.get("chat_id"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid chat"}

    with Session(engine) as db:
        participant = db.exec(
            select(ChatParticipant).where(
                ChatParticipant.chat_id == chat_id,
                ChatParticipant.user_id == sender_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).first()

        if participant is None:
            return {"ok": False, "error": "Not a participant"}

        chat = db.get(Chat, chat_id)
        if chat is None:
            return {"ok": False, "error": "Chat was not found"}

        message = Message(
            chat_id=chat_id,
            sender_id=sender_id,
            content=content,
            message_type=data.get("message_type", "text"),
            reply_to_message_id=data.get("reply_to_message_id"),
        )

        db.add(message)
        db.flush()
        db.refresh(message)

        # update chat
        chat.last_message_id = message.id
        chat.updated_at = message.created_at

        db.commit()
        db.refresh(chat)
        db.refresh(message)

        # collect participants
        participant_ids = db.exec(
            select(ChatParticipant.user_id).where(
                ChatParticipant.chat_id == chat_id,
                col(ChatParticipant.left_at).is_(None),
            )
        ).all()

        public_message = to_message_public(
            message,
            sender_username=sender_username,
            sender_avatar_url=sender_avatar_url,
        ).model_dump(mode="json", by_alias=True)

    await sio.emit(
        "message",
        public_message,
        room=str(chat_id),
        skip_sid=sid,
    )

    chat_update = {
        "chat_id": chat_id,
        "last_message": public_message,
    }

    for participant_id in participant_ids:
        await sio.emit(
            "chat_updated",
            chat_update,
            room=f"user:{participant_id}",
        )

    return {
        "ok": True,
        "message": public_message,
    }


# Final ASGI app: Socket.IO + FastAPI
app = socketio.ASGIApp(sio, fastapi_app)
