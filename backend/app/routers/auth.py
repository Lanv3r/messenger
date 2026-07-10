from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlmodel import col, select

from app.constants import SAVED_MESSAGES_AVATAR_URL
from app.db import SessionDep
from app.dependencies import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.models import (
    Chat,
    ChatParticipant,
    LoginRequest,
    User,
    UserCreate,
    UserPublic,
)
from app.rate_limit import login_rate_limiter, signup_rate_limiter
from app.settings import settings
from app.services.uploads import save_avatar_upload
from app.services.users import is_valid_username

router = APIRouter(tags=["auth"])


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        "access_token",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    return {"ok": True}


@router.post(
    "/login",
    response_model=UserPublic,
    dependencies=[Depends(login_rate_limiter)],
)
def login(payload: LoginRequest, response: Response, session: SessionDep):
    stmt = select(User).where(col(User.username) == payload.username.lower())
    user = session.exec(stmt).first()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return user


@router.post(
    "/signup",
    response_model=UserPublic,
    dependencies=[Depends(signup_rate_limiter)],
)
async def signup(
    response: Response,
    session: SessionDep,
    payload: Annotated[UserCreate, Form()],
    avatar: Annotated[UploadFile | None, File()] = None,
):
    normalized_username = payload.username.strip().lower()
    normalized_first_name = payload.first_name.strip()
    normalized_last_name = payload.last_name.strip() if payload.last_name else None
    normalized_bio = payload.bio.strip() if payload.bio else None

    if not normalized_username:
        raise HTTPException(status_code=400, detail="Username is invalid")
    if len(normalized_username) < 5:
        raise HTTPException(
            status_code=400, detail="Username must be at least 5 characters"
        )
    if len(normalized_username) > 32:
        raise HTTPException(
            status_code=400, detail="Maximum username length is 32 characters"
        )
    if not is_valid_username(normalized_username):
        raise HTTPException(
            status_code=400,
            detail="Username can include only a-z, 0-9, and underscores.",
        )

    if not normalized_first_name:
        raise HTTPException(status_code=400, detail="First name is required.")

    if len(normalized_first_name) > 64:
        raise HTTPException(
            status_code=400,
            detail="First name must be at most 64 characters.",
        )

    if normalized_last_name is not None and len(normalized_last_name) > 64:
        raise HTTPException(
            status_code=400,
            detail="Last name must be at most 64 characters.",
        )

    if normalized_bio is not None and len(normalized_bio) > 70:
        raise HTTPException(
            status_code=400,
            detail="Bio must be at most 70 characters.",
        )

    stmt = select(User).where(col(User.username) == normalized_username)
    existing_user = session.exec(stmt).first()
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="Username already registered")

    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password is too short")

    avatar_url = await save_avatar_upload(avatar)

    user = User(
        username=normalized_username,
        first_name=normalized_first_name,
        last_name=normalized_last_name or None,
        bio=normalized_bio or None,
        avatar_url=avatar_url or "/favicon.svg",
        status="online",
        password_hash=get_password_hash(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

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

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return user
