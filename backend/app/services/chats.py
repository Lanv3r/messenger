from app.models import Chat, ChatMemberPermissions, ChatParticipant
from app.permissions import (
    ADMIN_MEMBER_OVERLAP_PERMISSIONS,
    ADMIN_PERMISSIONS,
    MEMBER_BOOLEAN_PERMISSIONS,
    MEMBER_NUMERIC_PERMISSIONS,
    OWNER_PERMISSIONS,
    SYSTEM_ROLE_DEFAULTS,
)
from app.services.users import assert_direct_message_allowed
from fastapi import HTTPException
from sqlmodel import Session, col, select


def calculate_effective_permissions(
    participant: ChatParticipant,
    default_permissions: dict,
) -> dict:
    if participant.role == "owner":
        return OWNER_PERMISSIONS.copy()

    effective_member_permissions = get_effective_member_permissions(
        default_permissions,
        participant.member_permissions,
    )

    if participant.role == "member":
        return effective_member_permissions

    permissions = SYSTEM_ROLE_DEFAULTS["admin"].copy()
    permissions.update(effective_member_permissions)
    permissions.update(participant.admin_permissions or {})

    for key in ADMIN_MEMBER_OVERLAP_PERMISSIONS:
        if effective_member_permissions.get(key) is True:
            permissions[key] = True

    return permissions


def get_effective_permissions(
    participant: ChatParticipant,
    session: Session,
) -> dict:
    if participant.role == "owner":
        return OWNER_PERMISSIONS.copy()

    permission_record = session.get(
        ChatMemberPermissions,
        participant.chat_id,
    )
    if permission_record is None:
        raise HTTPException(
            status_code=404,
            detail="Chat permissions not found",
        )

    return calculate_effective_permissions(
        participant,
        permission_record.permissions,
    )


def get_effective_member_permissions(
    default_permissions: dict,
    member_overrides: dict | None,
) -> dict:
    permissions = default_permissions.copy()
    overrides = member_overrides or {}

    for key in MEMBER_BOOLEAN_PERMISSIONS:
        if default_permissions.get(key) is False:
            permissions[key] = False
            continue
        if key in overrides:
            permissions[key] = overrides[key]

    for key in MEMBER_NUMERIC_PERMISSIONS:
        default_value = int(default_permissions.get(key, 0))
        override_value = overrides.get(key)
        if override_value is None:
            permissions[key] = default_value
            continue
        permissions[key] = max(default_value, int(override_value))

    return permissions


def normalize_member_permission_overrides(
    default_permissions: dict,
    permissions: dict,
) -> dict:
    assert_valid_permission_list(permissions)

    overrides = {}

    for key in MEMBER_BOOLEAN_PERMISSIONS:
        if default_permissions.get(key) is False:
            if permissions[key] is not False:
                raise HTTPException(
                    status_code=400,
                    detail=f"{key} is disabled for all members",
                )
            continue
        if permissions[key] != default_permissions.get(key):
            overrides[key] = permissions[key]

    for key in MEMBER_NUMERIC_PERMISSIONS:
        default_value = int(default_permissions.get(key, 0))
        value = permissions[key]

        if value < default_value:
            raise HTTPException(
                status_code=400,
                detail=f"{key} cannot be lower than the group default",
            )
        if value != default_value:
            overrides[key] = value

    return overrides


def member_permissions_reduce_admin_rights(
    default_permissions: dict,
    effective_member_permissions: dict,
) -> bool:
    for key in MEMBER_BOOLEAN_PERMISSIONS:
        if (
            default_permissions.get(key) is True
            and effective_member_permissions.get(key) is not True
        ):
            return True

    for key in MEMBER_NUMERIC_PERMISSIONS:
        if int(effective_member_permissions.get(key, 0)) > int(
            default_permissions.get(key, 0)
        ):
            return True

    return False


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


def assert_direct_chat_message_allowed(
    session: Session,
    chat: Chat,
    sender_id: int,
) -> None:
    if chat.type != "direct":
        return
    if chat.id is None:
        raise HTTPException(status_code=500, detail="Chat was not loaded correctly")

    recipient_id = session.exec(
        select(col(ChatParticipant.user_id)).where(
            col(ChatParticipant.chat_id) == chat.id,
            col(ChatParticipant.user_id) != sender_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).first()
    if recipient_id is None:
        raise HTTPException(status_code=403, detail="Direct chat participant not found")

    assert_direct_message_allowed(session, sender_id, recipient_id)


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
            col(ChatParticipant.chat_id) == chat_id,
            col(ChatParticipant.user_id) == user_id,
            col(ChatParticipant.left_at).is_(None),
        )
    ).first()

    if participant is None:
        raise HTTPException(status_code=403, detail="Not a participant")

    return participant


def get_member_action_permissions(
    actor_participant: ChatParticipant,
    target_participant: ChatParticipant,
    chat_type: str,
    actor_permissions: dict,
    default_permissions: dict,
) -> dict[str, bool]:
    no_actions = {
        "can_edit_member_tags": False,
        "can_promote_to_admin": False,
        "can_edit_admin_rights": False,
        "can_edit_member_rights": False,
        "can_remove_from_group": False,
    }

    if chat_type != "group":
        return no_actions

    can_edit_member_tags = actor_permissions.get("edit_member_tags") is True
    can_manage_admins = actor_permissions.get("manage_admins") is True
    can_remove_members = actor_permissions.get("ban_users") is True

    target_is_manageable = (
        actor_participant.user_id != target_participant.user_id
        and target_participant.role != "owner"
    )

    can_manage_admin_target = False
    if (
        target_is_manageable
        and target_participant.role == "admin"
        and (can_manage_admins or can_remove_members)
    ):
        target_permissions = calculate_effective_permissions(
            target_participant,
            default_permissions,
        )
        try:
            assert_actor_strictly_outranks_target(
                actor_participant,
                target_participant,
                actor_permissions,
                target_permissions,
            )
            can_manage_admin_target = True
        except HTTPException:
            pass

    target_is_member = target_participant.role == "member"
    can_edit_member_rights = (
        can_remove_members
        and target_is_manageable
        and (target_is_member or can_manage_admin_target)
    )

    return {
        "can_edit_member_tags": can_edit_member_tags,
        "can_promote_to_admin": (
            can_manage_admins and target_is_manageable and target_is_member
        ),
        "can_edit_admin_rights": can_manage_admins and can_manage_admin_target,
        "can_edit_member_rights": can_edit_member_rights,
        "can_remove_from_group": can_edit_member_rights,
    }
