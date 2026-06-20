from app.models import Chat, ChatMemberPermissions, ChatParticipant
from app.permissions import (
    ADMIN_MEMBER_OVERLAP_PERMISSIONS,
    ADMIN_PERMISSIONS,
    MEMBER_BOOLEAN_PERMISSIONS,
    MEMBER_NUMERIC_PERMISSIONS,
    OWNER_PERMISSIONS,
    SYSTEM_ROLE_DEFAULTS,
)
from fastapi import HTTPException
from sqlmodel import Session, col, select


def get_effective_permissions(
    participant: ChatParticipant,
    session: Session,
) -> dict:
    if participant.role == "owner":
        return OWNER_PERMISSIONS.copy()
    member_permissions = session.get(
        ChatMemberPermissions,
        participant.chat_id,
    )
    if member_permissions is None:
        raise HTTPException(status_code=404, detail="Chat permissions not found")
    if participant.role == "member":
        return member_permissions.permissions
    else:
        permissions = SYSTEM_ROLE_DEFAULTS["admin"].copy()
        permissions.update(member_permissions.permissions)
        permissions.update(participant.admin_permissions or {})

        for key in ADMIN_MEMBER_OVERLAP_PERMISSIONS:
            if member_permissions.permissions.get(key) is True:
                permissions[key] = True

        return permissions


def assert_admin_permissions_do_not_restrict_enabled_member_permissions(
    admin_permissions: dict,
    member_permissions: dict,
):
    for key in ADMIN_MEMBER_OVERLAP_PERMISSIONS:
        if member_permissions.get(key) is True and admin_permissions.get(key) is False:
            raise HTTPException(
                status_code=400,
                detail=f"{key} is enabled for all members and cannot be disabled for admins",
            )


def require_chat_permission(
    session: Session,
    chat_id: int,
    user_id: int,
    permission: str,
):
    participant = require_active_participant(session, chat_id, user_id)

    chat = session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Direct/self chats only need membership.
    if chat.type != "group":
        return participant

    if participant.role == "owner":
        return participant

    permissions = get_effective_permissions(participant, session)

    if not permissions.get(permission):
        raise HTTPException(status_code=403, detail="Missing permission")

    return participant


def assert_valid_permission_list(permissions: dict):
    expected_keys = MEMBER_BOOLEAN_PERMISSIONS | MEMBER_NUMERIC_PERMISSIONS

    if set(permissions.keys()) != expected_keys:
        raise HTTPException(
            status_code=403, detail="New permissions are not standardized"
        )

    for key in MEMBER_BOOLEAN_PERMISSIONS:
        if type(permissions[key]) is not bool:
            raise HTTPException(
                status_code=403, detail="New permissions are not standardized"
            )

    for key in MEMBER_NUMERIC_PERMISSIONS:
        if type(permissions[key]) is not int:
            raise HTTPException(
                status_code=403, detail="New permissions are not standardized"
            )


def assert_valid_admin_permission_list(permissions: dict):
    if set(permissions.keys()) != ADMIN_PERMISSIONS:
        raise HTTPException(status_code=403, detail="Permission list is not valid")

    for key in ADMIN_PERMISSIONS:
        if type(permissions[key]) is not bool:
            raise HTTPException(status_code=403, detail="Permission list is not valid")


def assert_actor_strictly_outranks_target(
    actor: ChatParticipant,
    target: ChatParticipant,
    actor_permissions: dict,
    target_permissions: dict,
):
    if actor.role == "owner":
        return
    if target.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot manage owner")
    if actor.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin only",
        )
    if target.role == "member":
        return

    actor_enabled = {key for key, value in actor_permissions.items() if value is True}
    target_enabled = {key for key, value in target_permissions.items() if value is True}

    has_all_target_rights = target_enabled.issubset(actor_enabled)
    has_extra_right = len(actor_enabled - target_enabled) > 0

    if not has_all_target_rights or not has_extra_right:
        raise HTTPException(
            status_code=403,
            detail="Cannot manage an admin with equal or higher permissions",
        )


def assert_permissions_are_subset_or_equal(
    candidate_permissions: dict,
    allowed_permissions: dict,
):
    for permission, enabled in candidate_permissions.items():
        if enabled is True and allowed_permissions.get(permission) is not True:
            raise HTTPException(
                status_code=403,
                detail=f"{permission} is outside allowed permissions",
            )
    return True


def require_active_participant(
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
