import re

from fastapi import HTTPException
from sqlmodel import Session

from app.models import UserBlock


def is_valid_username(username: str) -> bool:
    pattern = r"^[a-z0-9_]+$"
    return re.fullmatch(pattern, username) is not None


def assert_direct_message_allowed(
    session: Session,
    sender_id: int,
    recipient_id: int,
) -> None:
    if session.get(UserBlock, (recipient_id, sender_id)) is not None:
        raise HTTPException(
            status_code=403,
            detail="This user does not accept direct messages from you",
        )
