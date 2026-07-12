import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { apiFetch } from "@/lib/api";
import {
  ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS,
  buildDefaultAdminPermissions,
  buildEffectiveMemberPermissions,
  enforceAdminMemberOverlaps,
} from "@/lib/permissions";
import type {
  AdminPermissions,
  Chat,
  ChatMember,
  MemberManagementMode,
  MemberPermissions,
} from "@/types";

type UseGroupMemberManagementOptions = {
  activeChat: Chat | undefined;
  currentUserId: number;
  onSessionExpired: () => void;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setChatInfoMembers: Dispatch<SetStateAction<ChatMember[]>>;
  getChatMemberDisplayName: (member: ChatMember) => string;
};

export function useGroupMemberManagement({
  activeChat,
  currentUserId,
  onSessionExpired,
  setChats,
  setChatInfoMembers,
  getChatMemberDisplayName,
}: UseGroupMemberManagementOptions) {
  const [selectedChatMember, setSelectedChatMember] =
    useState<ChatMember | null>(null);
  const [selectedMemberManagementMode, setSelectedMemberManagementMode] =
    useState<MemberManagementMode>(null);
  const [memberPermissions, setMemberPermissions] =
    useState<MemberPermissions | null>(null);
  const [memberPermissionsDraft, setMemberPermissionsDraft] =
    useState<MemberPermissions | null>(null);
  const [memberPermissionsLoading, setMemberPermissionsLoading] =
    useState(false);
  const [memberPermissionsSaving, setMemberPermissionsSaving] =
    useState(false);
  const [memberPermissionsError, setMemberPermissionsError] =
    useState<string | null>(null);
  const [memberPermissionsMessage, setMemberPermissionsMessage] =
    useState<string | null>(null);
  const [selectedMemberPermissionsDraft, setSelectedMemberPermissionsDraft] =
    useState<MemberPermissions | null>(null);
  const [selectedMemberPermissionsSaving, setSelectedMemberPermissionsSaving] =
    useState(false);
  const [selectedMemberPermissionsError, setSelectedMemberPermissionsError] =
    useState<string | null>(null);
  const [selectedMemberPermissionsMessage, setSelectedMemberPermissionsMessage] =
    useState<string | null>(null);
  const [adminPermissionsByUserId, setAdminPermissionsByUserId] = useState<
    Record<number, AdminPermissions>
  >({});
  const [adminPermissionsDraftByUserId, setAdminPermissionsDraftByUserId] =
    useState<Record<number, AdminPermissions>>({});
  const [adminPermissionsLoadingUserId, setAdminPermissionsLoadingUserId] =
    useState<number | null>(null);
  const [adminPermissionsSavingUserId, setAdminPermissionsSavingUserId] =
    useState<number | null>(null);
  const [adminPermissionsError, setAdminPermissionsError] =
    useState<string | null>(null);
  const [adminPermissionsMessage, setAdminPermissionsMessage] =
    useState<string | null>(null);
  const [memberRemovalUserId, setMemberRemovalUserId] =
    useState<number | null>(null);
  const [memberRemovalError, setMemberRemovalError] =
    useState<string | null>(null);
  const [memberRemovalMessage, setMemberRemovalMessage] =
    useState<string | null>(null);
  const [memberRemovalCandidate, setMemberRemovalCandidate] =
    useState<ChatMember | null>(null);

  const currentUserAdminPermissions =
    activeChat?.type === "group" && activeChat.current_user_role === "admin"
      ? adminPermissionsByUserId[currentUserId]
      : null;
  const currentUserCanDeleteGroupMessages =
    activeChat?.type === "group" &&
    (activeChat.current_user_role === "owner" ||
      currentUserAdminPermissions?.delete_messages === true);
  const currentUserCanPinGroupMessages =
    activeChat?.type === "group" &&
    (activeChat.current_user_role === "owner" ||
      currentUserAdminPermissions?.pin_messages === true ||
      memberPermissions?.pin_messages === true);
  const canAttemptManageGroup =
    activeChat?.type === "group" &&
    (activeChat.current_user_role === "owner" ||
      activeChat.current_user_role === "admin");
  const currentUserCanRemoveGroupMembers =
    activeChat?.type === "group" &&
    (activeChat.current_user_role === "owner" ||
      currentUserAdminPermissions?.ban_users === true);
  const selectedAdminPermissions = selectedChatMember
    ? (adminPermissionsDraftByUserId[selectedChatMember.user_id] ??
      adminPermissionsByUserId[selectedChatMember.user_id] ??
      (selectedChatMember.role === "member"
        ? buildDefaultAdminPermissions(memberPermissionsDraft ?? memberPermissions)
        : null))
    : null;
  const canEditSelectedAdmin =
    canAttemptManageGroup &&
    selectedChatMember?.role === "admin" &&
    selectedChatMember.user_id !== currentUserId;
  const canPromoteSelectedMember =
    canAttemptManageGroup &&
    selectedChatMember?.role === "member" &&
    selectedChatMember.user_id !== currentUserId;
  const canRemoveSelectedMember =
    currentUserCanRemoveGroupMembers &&
    selectedChatMember !== null &&
    selectedChatMember.user_id !== currentUserId &&
    selectedChatMember.role !== "owner";
  const canEditSelectedMemberPermissions =
    currentUserCanRemoveGroupMembers &&
    selectedChatMember !== null &&
    selectedChatMember.user_id !== currentUserId &&
    selectedChatMember.role !== "owner";
  const canOpenSelectedAdminManagement =
    selectedChatMember?.role === "admin"
      ? canEditSelectedAdmin || selectedChatMember.user_id === currentUserId
      : selectedChatMember?.role === "member" && canPromoteSelectedMember;
  const hasSelectedMemberManagementActions =
    canOpenSelectedAdminManagement || canEditSelectedMemberPermissions;
  const selectedMemberPermissionIsSaving =
    selectedChatMember !== null &&
    adminPermissionsSavingUserId === selectedChatMember.user_id;
  const selectedMemberRemovalIsSaving =
    selectedChatMember !== null &&
    memberRemovalUserId === selectedChatMember.user_id;

  const reset = useCallback(() => {
    setSelectedChatMember(null);
    setSelectedMemberManagementMode(null);
    setMemberPermissions(null);
    setMemberPermissionsDraft(null);
    setMemberPermissionsError(null);
    setMemberPermissionsMessage(null);
    setSelectedMemberPermissionsDraft(null);
    setSelectedMemberPermissionsError(null);
    setSelectedMemberPermissionsMessage(null);
    setSelectedMemberPermissionsSaving(false);
    setAdminPermissionsByUserId({});
    setAdminPermissionsDraftByUserId({});
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);
    setMemberRemovalCandidate(null);
    setMemberRemovalError(null);
    setMemberRemovalMessage(null);
  }, []);

  const clearMemberRemoval = () => {
    setMemberRemovalError(null);
    setMemberRemovalMessage(null);
    setMemberRemovalCandidate(null);
  };

  const clearRemovedMembers = (memberIds: number[]) => {
    setSelectedChatMember((current) =>
      current && memberIds.includes(current.user_id) ? null : current,
    );
    setMemberRemovalCandidate((current) =>
      current && memberIds.includes(current.user_id) ? null : current,
    );
  };

  const loadMemberDefaultPermissions = async (chatId: number) => {
    setMemberPermissionsLoading(true);
    setMemberPermissionsError(null);
    setMemberPermissionsMessage(null);

    try {
      const permissions = await apiFetch<MemberPermissions>(
        `/chats/${chatId}/member-default-permissions`,
      );
      setMemberPermissions(permissions);
      setMemberPermissionsDraft({ ...permissions });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load member permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setMemberPermissionsError(message);
    } finally {
      setMemberPermissionsLoading(false);
    }
  };

  const loadAdminPermissions = async (chatId: number, memberId: number) => {
    setAdminPermissionsLoadingUserId(memberId);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      const permissions = await apiFetch<AdminPermissions>(
        `/chats/${chatId}/admins/${memberId}/permissions`,
      );
      setAdminPermissionsByUserId((current) => ({
        ...current,
        [memberId]: permissions,
      }));
      setAdminPermissionsDraftByUserId((current) => ({
        ...current,
        [memberId]: permissions,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load admin permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsLoadingUserId(null);
    }
  };

  const loadAdminPermissionsFromEffect = useEffectEvent(
    (chatId: number, memberId: number) => {
      void loadAdminPermissions(chatId, memberId);
    },
  );

  useEffect(() => {
    if (!selectedChatMember || activeChat?.type !== "group") {
      setSelectedMemberPermissionsDraft(null);
      return;
    }

    setSelectedMemberPermissionsDraft(
      buildEffectiveMemberPermissions(
        memberPermissionsDraft ?? memberPermissions,
        selectedChatMember.member_permissions,
      ),
    );
  }, [
    activeChat?.type,
    memberPermissions,
    memberPermissionsDraft,
    selectedChatMember,
  ]);

  useEffect(() => {
    if (
      activeChat?.type !== "group" ||
      activeChat.current_user_role !== "admin" ||
      adminPermissionsByUserId[currentUserId]
    ) {
      return;
    }

    loadAdminPermissionsFromEffect(activeChat.id, currentUserId);
  }, [
    activeChat?.id,
    activeChat?.type,
    activeChat?.current_user_role,
    adminPermissionsByUserId,
    currentUserId,
  ]);

  const openChatMemberProfile = (member: ChatMember) => {
    setSelectedChatMember(member);
    setSelectedMemberManagementMode(null);
    setSelectedMemberPermissionsDraft(
      buildEffectiveMemberPermissions(
        memberPermissionsDraft ?? memberPermissions,
        member.member_permissions,
      ),
    );
    setSelectedMemberPermissionsError(null);
    setSelectedMemberPermissionsMessage(null);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);
    setMemberRemovalError(null);
    setMemberRemovalMessage(null);

    if (activeChat?.type === "group" && member.role === "admin") {
      void loadAdminPermissions(activeChat.id, member.user_id);
    }

    if (member.role === "member") {
      const defaultPermissions = buildDefaultAdminPermissions(
        memberPermissionsDraft ?? memberPermissions,
      );

      setAdminPermissionsDraftByUserId((current) => ({
        ...current,
        [member.user_id]: current[member.user_id] ?? defaultPermissions,
      }));
    }
  };

  const updateMemberBooleanPermission = (key: string, value: boolean) => {
    setMemberPermissionsDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setMemberPermissionsMessage(null);
    setMemberPermissionsError(null);
  };

  const updateMemberNumericPermission = (key: string, value: number) => {
    setMemberPermissionsDraft((current) =>
      current
        ? {
            ...current,
            [key]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
          }
        : current,
    );
    setMemberPermissionsMessage(null);
    setMemberPermissionsError(null);
  };

  const updateSelectedMemberBooleanPermission = (
    key: string,
    value: boolean,
  ) => {
    setSelectedMemberPermissionsDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setSelectedMemberPermissionsMessage(null);
    setSelectedMemberPermissionsError(null);
  };

  const updateSelectedMemberNumericPermission = (
    key: string,
    value: number,
  ) => {
    setSelectedMemberPermissionsDraft((current) =>
      current
        ? {
            ...current,
            [key]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
          }
        : current,
    );
    setSelectedMemberPermissionsMessage(null);
    setSelectedMemberPermissionsError(null);
  };

  const updateAdminPermission = (
    memberId: number,
    key: string,
    value: boolean,
  ) => {
    setAdminPermissionsDraftByUserId((current) => {
      const currentDraft =
        current[memberId] ??
        adminPermissionsByUserId[memberId] ??
        buildDefaultAdminPermissions(memberPermissionsDraft ?? memberPermissions);

      return {
        ...current,
        [memberId]: {
          ...currentDraft,
          [key]: value,
        },
      };
    });
    setAdminPermissionsMessage(null);
    setAdminPermissionsError(null);
  };

  const saveMemberDefaultPermissions = async () => {
    if (!activeChat || activeChat.type !== "group" || !memberPermissionsDraft) {
      return;
    }

    setMemberPermissionsSaving(true);
    setMemberPermissionsError(null);
    setMemberPermissionsMessage(null);

    try {
      await apiFetch<null>(
        `/chats/${activeChat.id}/member-default-permissions`,
        {
          method: "PATCH",
          body: JSON.stringify(memberPermissionsDraft),
        },
      );
      setMemberPermissions(memberPermissionsDraft);
      setMemberPermissionsMessage("Member defaults updated.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update member permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setMemberPermissionsError(message);
    } finally {
      setMemberPermissionsSaving(false);
    }
  };

  const saveSelectedMemberPermissions = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      !selectedMemberPermissionsDraft
    ) {
      return;
    }

    setSelectedMemberPermissionsSaving(true);
    setSelectedMemberPermissionsError(null);
    setSelectedMemberPermissionsMessage(null);

    try {
      const updatedMember = await apiFetch<ChatMember>(
        `/chats/${activeChat.id}/members/${selectedChatMember.user_id}/permissions`,
        {
          method: "PATCH",
          body: JSON.stringify(selectedMemberPermissionsDraft),
        },
      );
      const wasDemoted =
        selectedChatMember.role === "admin" && updatedMember.role === "member";

      setChatInfoMembers((current) =>
        current.map((member) =>
          member.user_id === updatedMember.user_id ? updatedMember : member,
        ),
      );
      setSelectedChatMember(updatedMember);

      if (updatedMember.role !== "admin") {
        setAdminPermissionsByUserId((current) => {
          const next = { ...current };
          delete next[updatedMember.user_id];
          return next;
        });
        setAdminPermissionsDraftByUserId((current) => {
          const next = { ...current };
          delete next[updatedMember.user_id];
          return next;
        });
      }

      if (updatedMember.user_id === currentUserId) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === activeChat.id
              ? { ...chat, current_user_role: updatedMember.role }
              : chat,
          ),
        );
      }

      setSelectedMemberPermissionsMessage(
        wasDemoted
          ? "Member rights updated. This user was demoted to member."
          : "Member rights updated.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update member rights.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setSelectedMemberPermissionsError(message);
    } finally {
      setSelectedMemberPermissionsSaving(false);
    }
  };

  const promoteSelectedMember = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      selectedChatMember.role !== "member"
    ) {
      return;
    }

    const permissions = enforceAdminMemberOverlaps(
      adminPermissionsDraftByUserId[selectedChatMember.user_id] ??
        buildDefaultAdminPermissions(memberPermissionsDraft ?? memberPermissions),
      memberPermissionsDraft ?? memberPermissions,
    );

    setAdminPermissionsSavingUserId(selectedChatMember.user_id);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      await apiFetch<{ ok: boolean }>(
        `/chats/${activeChat.id}/admins/${selectedChatMember.user_id}/promote`,
        {
          method: "POST",
          body: JSON.stringify(permissions),
        },
      );

      setAdminPermissionsByUserId((current) => ({
        ...current,
        [selectedChatMember.user_id]: permissions,
      }));
      setAdminPermissionsDraftByUserId((current) => ({
        ...current,
        [selectedChatMember.user_id]: permissions,
      }));
      setChatInfoMembers((current) =>
        current.map((member) =>
          member.user_id === selectedChatMember.user_id
            ? { ...member, role: "admin", member_permissions: {} }
            : member,
        ),
      );
      setSelectedChatMember((current) =>
        current && current.user_id === selectedChatMember.user_id
          ? { ...current, role: "admin", member_permissions: {} }
          : current,
      );
      setSelectedMemberPermissionsDraft(
        buildEffectiveMemberPermissions(
          memberPermissionsDraft ?? memberPermissions,
          {},
        ),
      );
      setAdminPermissionsMessage(
        "Admin promoted. Member restrictions were restored.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to promote admin.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsSavingUserId(null);
    }
  };

  const saveSelectedAdminPermissions = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      selectedChatMember.role !== "admin"
    ) {
      return;
    }

    const rawPermissions =
      adminPermissionsDraftByUserId[selectedChatMember.user_id] ??
      adminPermissionsByUserId[selectedChatMember.user_id];

    if (!rawPermissions) {
      setAdminPermissionsError("Load admin permissions first.");
      return;
    }

    const permissions = enforceAdminMemberOverlaps(
      rawPermissions,
      memberPermissionsDraft ?? memberPermissions,
    );

    setAdminPermissionsSavingUserId(selectedChatMember.user_id);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      await apiFetch<null>(
        `/chats/${activeChat.id}/admins/${selectedChatMember.user_id}/permissions`,
        {
          method: "PATCH",
          body: JSON.stringify(permissions),
        },
      );
      setAdminPermissionsByUserId((current) => ({
        ...current,
        [selectedChatMember.user_id]: permissions,
      }));
      setAdminPermissionsMessage("Admin permissions updated.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update admin permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsSavingUserId(null);
    }
  };

  const dismissSelectedAdmin = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      selectedChatMember.role !== "admin"
    ) {
      return;
    }

    setAdminPermissionsSavingUserId(selectedChatMember.user_id);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      await apiFetch<{ ok: boolean }>(
        `/chats/${activeChat.id}/admins/${selectedChatMember.user_id}/dismiss`,
        {
          method: "POST",
        },
      );
      setAdminPermissionsByUserId((current) => {
        const next = { ...current };
        delete next[selectedChatMember.user_id];
        return next;
      });
      setAdminPermissionsDraftByUserId((current) => {
        const next = { ...current };
        delete next[selectedChatMember.user_id];
        return next;
      });
      setChatInfoMembers((current) =>
        current.map((member) =>
          member.user_id === selectedChatMember.user_id
            ? { ...member, role: "member" }
            : member,
        ),
      );
      setSelectedChatMember((current) =>
        current && current.user_id === selectedChatMember.user_id
          ? { ...current, role: "member" }
          : current,
      );
      setAdminPermissionsMessage("Admin dismissed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to dismiss admin.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsSavingUserId(null);
    }
  };

  const startRemovingMember = (member: ChatMember) => {
    setMemberRemovalError(null);
    setMemberRemovalMessage(null);
    setMemberRemovalCandidate(member);
  };

  const cancelRemovingMember = () => {
    setMemberRemovalCandidate(null);
  };

  const removeSelectedChatMember = async (member = memberRemovalCandidate) => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !member ||
      member.user_id === currentUserId ||
      member.role === "owner"
    ) {
      return;
    }

    const removedMember = member;

    setMemberRemovalUserId(removedMember.user_id);
    setMemberRemovalError(null);
    setMemberRemovalMessage(null);

    try {
      await apiFetch<{ ok: boolean }>(
        `/chats/${activeChat.id}/members/${removedMember.user_id}`,
        {
          method: "DELETE",
        },
      );

      setChatInfoMembers((current) =>
        current.filter((member) => member.user_id !== removedMember.user_id),
      );
      setSelectedChatMember(null);
      setAdminPermissionsByUserId((current) => {
        const next = { ...current };
        delete next[removedMember.user_id];
        return next;
      });
      setAdminPermissionsDraftByUserId((current) => {
        const next = { ...current };
        delete next[removedMember.user_id];
        return next;
      });
      setChats((current) =>
        current.map((chat) => {
          if (chat.id !== activeChat.id) {
            return chat;
          }

          const memberIds = chat.member_ids.filter(
            (memberId) => memberId !== removedMember.user_id,
          );

          return {
            ...chat,
            member_ids: memberIds,
            member_count: memberIds.length,
          };
        }),
      );
      setMemberRemovalMessage(
        `${getChatMemberDisplayName(removedMember)} removed from the group.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to remove member.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setMemberRemovalError(message);
    } finally {
      setMemberRemovalUserId(null);
      setMemberRemovalCandidate(null);
    }
  };

  const adminPermissionIsForcedByMemberDefault = (key: string) => {
    return (
      (ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS as readonly string[]).includes(
        key,
      ) && (memberPermissionsDraft ?? memberPermissions)?.[key] === true
    );
  };

  const memberPermissionIsLockedByDefault = (key: string) => {
    return (memberPermissionsDraft ?? memberPermissions)?.[key] === false;
  };

  return {
    selectedChatMember,
    selectedMemberManagementMode,
    memberPermissions,
    memberPermissionsDraft,
    memberPermissionsLoading,
    memberPermissionsSaving,
    memberPermissionsError,
    memberPermissionsMessage,
    selectedMemberPermissionsDraft,
    selectedMemberPermissionsSaving,
    selectedMemberPermissionsError,
    selectedMemberPermissionsMessage,
    adminPermissionsLoadingUserId,
    adminPermissionsSavingUserId,
    adminPermissionsError,
    adminPermissionsMessage,
    memberRemovalUserId,
    memberRemovalError,
    memberRemovalMessage,
    memberRemovalCandidate,
    currentUserCanDeleteGroupMessages,
    currentUserCanPinGroupMessages,
    currentUserCanRemoveGroupMembers,
    selectedAdminPermissions,
    canEditSelectedAdmin,
    canPromoteSelectedMember,
    canRemoveSelectedMember,
    canEditSelectedMemberPermissions,
    hasSelectedMemberManagementActions,
    selectedMemberPermissionIsSaving,
    selectedMemberRemovalIsSaving,
    setSelectedChatMember,
    setSelectedMemberManagementMode,
    reset,
    clearMemberRemoval,
    clearRemovedMembers,
    loadMemberDefaultPermissions,
    loadAdminPermissions,
    openChatMemberProfile,
    updateMemberBooleanPermission,
    updateMemberNumericPermission,
    updateSelectedMemberBooleanPermission,
    updateSelectedMemberNumericPermission,
    updateAdminPermission,
    saveMemberDefaultPermissions,
    saveSelectedMemberPermissions,
    promoteSelectedMember,
    saveSelectedAdminPermissions,
    dismissSelectedAdmin,
    startRemovingMember,
    cancelRemovingMember,
    removeSelectedChatMember,
    adminPermissionIsForcedByMemberDefault,
    memberPermissionIsLockedByDefault,
  };
}
