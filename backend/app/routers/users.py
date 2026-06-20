from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.db import SessionDep
from app.dependencies import get_current_user
from app.models import User, UserProfileUpdate, UserPublic
from app.services.users import is_valid_username

router = APIRouter(tags=["users"])


@router.get("/users/username-availability")
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


@router.get("/users/by-username/{username}", response_model=UserPublic)
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


@router.get("/users/me/", response_model=UserPublic)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@router.patch("/users/me/", response_model=UserPublic)
def update_me(
    payload: UserProfileUpdate,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    update_data = payload.model_dump(exclude_unset=True)

    first_name = update_data.get("first_name", None)
    last_name = update_data.get("last_name", None)
    bio = update_data.get("bio", None)

    if first_name is not None and len(first_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="First name must be at most 64 characters.",
        )

    if last_name is not None and len(last_name.strip()) > 64:
        raise HTTPException(
            status_code=400,
            detail="Last name must be at most 64 characters.",
        )

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
