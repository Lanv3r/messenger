from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import col, select

from app.db import SessionDep
from app.dependencies import get_current_user
from app.models import Contact, User, UserBlock, UserProfileUpdate, UserPublic
from app.services.uploads import save_avatar_upload
from app.services.users import is_valid_username
from app.socket import sio

router = APIRouter(tags=["users"])


def user_profile_update_from_form(
    first_name: Annotated[str | None, Form()] = None,
    last_name: Annotated[str | None, Form()] = None,
    bio: Annotated[str | None, Form()] = None,
) -> UserProfileUpdate:
    return UserProfileUpdate(
        first_name=first_name,
        last_name=last_name,
        bio=bio,
    )


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
        select(User).where(col(User.username) == normalized_username)
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
        select(User).where(col(User.username) == normalized_username)
    ).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users/me/", response_model=UserPublic)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@router.get("/users/me/contacts", response_model=list[UserPublic])
def get_contacts(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=500, detail="User was not loaded correctly")

    return session.exec(
        select(User)
        .join(Contact, col(Contact.contact_user_id) == col(User.id))
        .where(col(Contact.owner_user_id) == current_user_id)
        .order_by(col(User.first_name), col(User.last_name), col(User.username))
    ).all()


@router.put("/users/me/contacts/{user_id}", response_model=UserPublic)
def add_contact(
    user_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=500, detail="User was not loaded correctly")
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot add yourself as a contact")

    contact_user = session.get(User, user_id)
    if contact_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    contact = session.get(Contact, (current_user_id, user_id))
    if contact is None:
        session.add(
            Contact(
                owner_user_id=current_user_id,
                contact_user_id=user_id,
            )
        )
        session.commit()

    return contact_user


@router.delete("/users/me/contacts/{user_id}", response_model=UserPublic)
def remove_contact(
    user_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=500, detail="User was not loaded correctly")

    contact_user = session.get(User, user_id)
    if contact_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    contact = session.get(Contact, (current_user_id, user_id))
    if contact is not None:
        session.delete(contact)
        session.commit()

    return contact_user


@router.get("/users/me/blocks", response_model=list[UserPublic])
def get_blocks(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=500, detail="User was not loaded correctly")

    return session.exec(
        select(User)
        .join(UserBlock, col(UserBlock.blocked_user_id) == col(User.id))
        .where(col(UserBlock.blocker_user_id) == current_user_id)
        .order_by(col(User.first_name), col(User.last_name), col(User.username))
    ).all()


@router.put("/users/me/blocks/{user_id}", response_model=UserPublic)
async def block_user(
    user_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=500, detail="User was not loaded correctly")
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot block yourself")

    blocked_user = session.get(User, user_id)
    if blocked_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    block = session.get(UserBlock, (current_user_id, user_id))
    if block is None:
        session.add(
            UserBlock(
                blocker_user_id=current_user_id,
                blocked_user_id=user_id,
            )
        )
        session.commit()

    await sio.emit(
        "direct_message_access_updated",
        {
            "other_user_id": current_user_id,
            "is_blocked_by_other": True,
        },
        room=f"user:{user_id}",
    )

    return blocked_user


@router.delete("/users/me/blocks/{user_id}", response_model=UserPublic)
async def unblock_user(
    user_id: int,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    current_user_id = current_user.id
    if current_user_id is None:
        raise HTTPException(status_code=500, detail="User was not loaded correctly")

    blocked_user = session.get(User, user_id)
    if blocked_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    block = session.get(UserBlock, (current_user_id, user_id))
    if block is not None:
        session.delete(block)
        session.commit()

    await sio.emit(
        "direct_message_access_updated",
        {
            "other_user_id": current_user_id,
            "is_blocked_by_other": False,
        },
        room=f"user:{user_id}",
    )

    return blocked_user


@router.patch("/users/me/", response_model=UserPublic)
async def update_me(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    payload: Annotated[UserProfileUpdate, Depends(user_profile_update_from_form)],
    avatar: Annotated[UploadFile | None, File()] = None,
):
    update_data: dict[str, str | None] = {}

    first_name = payload.first_name
    last_name = payload.last_name
    bio = payload.bio

    if first_name is not None and not first_name.strip():
        raise HTTPException(status_code=400, detail="First name is required.")

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

    if first_name is not None:
        update_data["first_name"] = first_name.strip()
    if last_name is not None:
        update_data["last_name"] = last_name.strip() or None
    if bio is not None:
        update_data["bio"] = bio.strip() or None

    avatar_storage_key = await save_avatar_upload(avatar)
    if avatar_storage_key is not None:
        update_data["avatar_storage_key"] = avatar_storage_key

    for key, value in update_data.items():
        setattr(current_user, key, value)

    current_user.updated_at = datetime.now(timezone.utc)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return current_user
