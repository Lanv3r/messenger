from datetime import timedelta

from fastapi import APIRouter, HTTPException, Response
from sqlmodel import select

from app.constants import SAVED_MESSAGES_AVATAR_URL
from app.db import SessionDep
from app.dependencies import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.models import Chat, ChatParticipant, LoginRequest, User, UserCreate, UserPublic
from app.services.users import is_valid_username

router = APIRouter(tags=["auth"])


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}


@router.post("/login", response_model=UserPublic)
def login(payload: LoginRequest, response: Response, session: SessionDep):
    stmt = select(User).where(User.username == payload.username.lower())
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
        secure=False,  # True in production with HTTPS
        samesite="lax",  # "none" only if cross-site + HTTPS
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return user


@router.post("/signup", response_model=UserPublic)
def signup(user_create: UserCreate, response: Response, session: SessionDep):
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

    if user_create.first_name is not None and len(user_create.first_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="First name must be at most 64 characters.",
        )

    if user_create.last_name is not None and len(user_create.last_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="Last name must be at most 64 characters.",
        )

    if user_create.bio is not None and len(user_create.bio.strip()) > 70:
        raise HTTPException(
            status_code=400,
            detail="Bio must be at most 70 characters.",
        )

    stmt = select(User).where(User.username == user_create.username.lower())
    existing_user = session.exec(stmt).first()
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="Username already registered")

    if len(user_create.password) < 8:
        raise HTTPException(status_code=400, detail="Password is too short")

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
        secure=False,  # True in production with HTTPS
        samesite="lax",  # "none" only if cross-site + HTTPS
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return user
