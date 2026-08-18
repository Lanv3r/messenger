from typing import Annotated

from app.db import SessionDep
from app.dependencies import (
    create_user_session,
    get_password_hash,
    revoke_user_session,
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
from app.services.uploads import save_avatar_upload
from app.services.users import is_valid_username
from app.settings import settings
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from sqlmodel import col, select

router = APIRouter(tags=["auth"])


@router.post("/logout")
async def logout(response: Response, token: str | None = Cookie(default=None)):
    if token is not None:
        try:
            await revoke_user_session(token)
        except Exception:
            pass

    response.delete_cookie(
        "token",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    return {"ok": True}


@router.post(
    "/login",
    response_model=UserPublic,
    dependencies=[Depends(login_rate_limiter)],
)
async def login(payload: LoginRequest, response: Response, session: SessionDep):
    user = session.exec(
        select(User).where(
            col(User.username) == payload.username.lower(),
        )
    ).first()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    if user.id is None:
        raise HTTPException(status_code=500, detail="Invalid user")

    token = await create_user_session(user.id)

    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.session_timeout_seconds,
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
    username: Annotated[str, Form()],
    password: Annotated[str, Form()],
    first_name: Annotated[str, Form()],
    last_name: Annotated[str | None, Form()] = None,
    bio: Annotated[str | None, Form()] = None,
    avatar: Annotated[UploadFile | None, File()] = None,
):
    payload = UserCreate(
        username=username,
        password=password,
        first_name=first_name,
        last_name=last_name,
        bio=bio,
    )
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

    avatar_storage_key = await save_avatar_upload(avatar)

    user = User(
        username=normalized_username,
        first_name=normalized_first_name,
        last_name=normalized_last_name or None,
        bio=normalized_bio or None,
        avatar_storage_key=avatar_storage_key,
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

    token = await create_user_session(user.id)

    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.session_timeout_seconds,
    )

    return user
