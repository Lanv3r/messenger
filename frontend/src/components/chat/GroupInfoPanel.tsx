import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  LogOut,
  Pencil,
  ShieldPlus,
  Tag,
  UserMinus,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GroupSettingsPanel } from "@/components/chat/GroupSettingsPanel";
import { sortChatMembers } from "@/lib/chat-helpers";
import { getAssetUrl } from "@/lib/message-helpers";
import type {
  Chat,
  ChatMember,
  MemberManagementMode,
  MemberPermissions,
} from "@/types";

type MemberContextMenu = {
  member: ChatMember;
  x: number;
  y: number;
};

function getMemberMenuPosition(clientX: number, clientY: number) {
  const menuWidth = 220;
  const menuMaxHeight = 244;
  const viewportPadding = 8;
  const maxX = Math.max(
    viewportPadding,
    window.innerWidth - menuWidth - viewportPadding,
  );
  const maxY = Math.max(
    viewportPadding,
    window.innerHeight - menuMaxHeight - viewportPadding,
  );

  return {
    x: Math.min(Math.max(clientX, viewportPadding), maxX),
    y: Math.min(Math.max(clientY, viewportPadding), maxY),
  };
}

type GroupInfoPanelProps = {
  chat: Chat;
  members: ChatMember[];
  loading: boolean;
  error: string | null;
  isAddingMember: boolean;
  isManaging: boolean;
  canManageGroup: boolean;
  canEditGroupInfo: boolean;
  canManageMembers: boolean;
  canDeleteGroup: boolean;
  memberRemovalUserId: number | null;
  memberRemovalError: string | null;
  memberRemovalMessage: string | null;
  selectedChatMember: ChatMember | null;
  addMemberQuery: string;
  addMemberLoading: boolean;
  addMemberError: string | null;
  addMemberMessage: string | null;
  memberPermissionsDraft: MemberPermissions | null;
  memberPermissionsLoading: boolean;
  memberPermissionsSaving: boolean;
  memberPermissionsError: string | null;
  memberPermissionsMessage: string | null;
  getChatTitle: (chat: Chat) => string;
  getChatMemberDisplayName: (member: ChatMember) => string;
  onCloseTopmost: () => void;
  onClose: () => void;
  onOpenManage: () => void;
  onOpenAddMember: () => void;
  onCloseAddMember: () => void;
  onCloseManage: () => void;
  onUpdateGroupProfile: (
    title: string,
    description: string,
    avatar: File | null,
  ) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
  onViewMemberProfile: (member: ChatMember) => void;
  onOpenMemberManagement: (
    member: ChatMember,
    mode: MemberManagementMode,
  ) => void;
  onStartRemoveMember: (member: ChatMember) => void;
  onAddMemberTag: (member: ChatMember, tag: string) => Promise<ChatMember>;
  onAddMemberQueryChange: (value: string) => void;
  onAddMemberSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMemberBooleanPermissionChange: (key: string, value: boolean) => void;
  onMemberNumericPermissionChange: (key: string, value: number) => void;
  onSaveMemberDefaultPermissions: () => void;
  onLeaveGroup: () => void;
};

export function GroupInfoPanel({
  chat,
  members,
  loading,
  error,
  isAddingMember,
  isManaging,
  canManageGroup,
  canEditGroupInfo,
  canManageMembers,
  canDeleteGroup,
  memberRemovalUserId,
  memberRemovalError,
  memberRemovalMessage,
  selectedChatMember,
  addMemberQuery,
  addMemberLoading,
  addMemberError,
  addMemberMessage,
  memberPermissionsDraft,
  memberPermissionsLoading,
  memberPermissionsSaving,
  memberPermissionsError,
  memberPermissionsMessage,
  getChatTitle,
  getChatMemberDisplayName,
  onCloseTopmost,
  onClose,
  onOpenManage,
  onOpenAddMember,
  onCloseAddMember,
  onCloseManage,
  onUpdateGroupProfile,
  onDeleteGroup,
  onViewMemberProfile,
  onOpenMemberManagement,
  onStartRemoveMember,
  onAddMemberTag,
  onAddMemberQueryChange,
  onAddMemberSubmit,
  onMemberBooleanPermissionChange,
  onMemberNumericPermissionChange,
  onSaveMemberDefaultPermissions,
  onLeaveGroup,
}: GroupInfoPanelProps) {
  const rankedMembers = sortChatMembers(members);
  const [memberContextMenu, setMemberContextMenu] =
    useState<MemberContextMenu | null>(null);
  const memberContextMenuRef = useRef<HTMLDivElement | null>(null);
  const [taggingMember, setTaggingMember] = useState<ChatMember | null>(null);
  const [memberTag, setMemberTag] = useState("");
  const [memberTagError, setMemberTagError] = useState<string | null>(null);
  const [memberTagSaving, setMemberTagSaving] = useState(false);

  useEffect(() => {
    if (!memberContextMenu) {
      return undefined;
    }

    const closeMemberContextMenu = () => setMemberContextMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      if (!memberContextMenuRef.current?.contains(event.target as Node)) {
        closeMemberContextMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMemberContextMenu();
      }
    };

    // Capture before the panel's click handler stops bubbling events.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", closeMemberContextMenu, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", closeMemberContextMenu, true);
    };
  }, [memberContextMenu]);

  const closeMemberTagDialog = () => {
    if (memberTagSaving) {
      return;
    }

    setTaggingMember(null);
    setMemberTag("");
    setMemberTagError(null);
  };

  const openMemberTagDialog = (member: ChatMember) => {
    setMemberContextMenu(null);
    setTaggingMember(member);
    setMemberTag("");
    setMemberTagError(null);
  };

  const handleMemberTagSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!taggingMember) {
      return;
    }

    const tag = memberTag.trim();
    if (!tag) {
      setMemberTagError("Enter a tag.");
      return;
    }

    setMemberTagSaving(true);
    setMemberTagError(null);

    try {
      await onAddMemberTag(taggingMember, tag);
      setTaggingMember(null);
      setMemberTag("");
    } catch (error) {
      setMemberTagError(
        error instanceof Error ? error.message : "Unable to add member tag.",
      );
    } finally {
      setMemberTagSaving(false);
    }
  };

  return (
    <div
      className="chat-info-backdrop"
      role="presentation"
      onClick={onCloseTopmost}
    >
      <section
        className="chat-info-panel group-info-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Group members"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-info-header">
          <button type="button" aria-label="Close group info" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="chat-info-profile group-info-profile">
          <img
            src={getAssetUrl(chat.display_avatar_url || chat.avatar_url)}
            alt=""
            onError={(event) => {
              event.currentTarget.src = "/favicon.svg";
            }}
          />
          <div>
            <h2>{getChatTitle(chat)}</h2>
            {chat.description ? <p>{chat.description}</p> : null}
          </div>
        </div>

        <div className="chat-info-actions">
          {canManageGroup ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenManage}
            >
              Edit group
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="chat-info-leave-button"
            onClick={onLeaveGroup}
          >
            <LogOut size={15} aria-hidden="true" />
            Leave
          </Button>
        </div>

        {loading ? <p className="message-search-empty">Loading...</p> : null}
        {error ? <p className="profile-error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="chat-members-heading">
              <strong>
                {chat.member_count}{" "}
                {chat.member_count === 1 ? "member" : "members"}
              </strong>
              <button
                type="button"
                aria-label="Add member"
                onClick={onOpenAddMember}
              >
                +
              </button>
            </div>

            <div className="chat-member-list">
              {rankedMembers.map((member) => (
                <div
                  className={[
                    "chat-member-row",
                    member.can_remove_from_group
                      ? "can-remove"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={member.user_id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMemberContextMenu({
                      member,
                      ...getMemberMenuPosition(event.clientX, event.clientY),
                    });
                  }}
                >
                  <button
                    type="button"
                    className="chat-member-main"
                    onClick={() => onViewMemberProfile(member)}
                  >
                    <img
                      src={getAssetUrl(member.avatar_url)}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = "/favicon.svg";
                      }}
                    />
                    <div>
                      <strong>
                        {getChatMemberDisplayName(member)}
                      </strong>
                      <span>@{member.username}</span>
                      {member.member_tags?.length ? (
                        <span className="chat-member-tags">
                          {member.member_tags.map((tag) => (
                            <span className="chat-member-tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  <div className="chat-member-side">
                    {member.can_remove_from_group ? (
                      <button
                        type="button"
                        disabled={memberRemovalUserId === member.user_id}
                        onClick={() => onStartRemoveMember(member)}
                      >
                        {memberRemovalUserId === member.user_id
                          ? "Removing..."
                          : "Remove"}
                      </button>
                    ) : null}
                    <small
                      className={
                        member.role === "owner" || member.role === "admin"
                          ? `chat-member-role-tag ${member.role}`
                          : undefined
                      }
                    >
                      {member.role}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            {memberContextMenu ? (
              <div
                ref={memberContextMenuRef}
                className="chat-member-context-menu"
                role="menu"
                style={{
                  left: memberContextMenu.x,
                  top: memberContextMenu.y,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onViewMemberProfile(memberContextMenu.member);
                    setMemberContextMenu(null);
                  }}
                >
                  <UserRound size={15} aria-hidden="true" />
                  View profile
                </button>
                {memberContextMenu.member.can_edit_member_tags ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openMemberTagDialog(memberContextMenu.member)}
                  >
                    <Tag size={15} aria-hidden="true" />
                    Add member tag
                  </button>
                ) : null}
                {memberContextMenu.member.can_promote_to_admin ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenMemberManagement(memberContextMenu.member, "admin");
                      setMemberContextMenu(null);
                    }}
                  >
                    <ShieldPlus size={15} aria-hidden="true" />
                    Promote to admin
                  </button>
                ) : null}
                {memberContextMenu.member.can_edit_admin_rights ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenMemberManagement(memberContextMenu.member, "admin");
                      setMemberContextMenu(null);
                    }}
                  >
                    <ShieldPlus size={15} aria-hidden="true" />
                    Edit admin rights
                  </button>
                ) : null}
                {memberContextMenu.member.can_edit_member_rights ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenMemberManagement(memberContextMenu.member, "member");
                      setMemberContextMenu(null);
                    }}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    Edit member rights
                  </button>
                ) : null}
                {memberContextMenu.member.can_remove_from_group ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      onStartRemoveMember(memberContextMenu.member);
                      setMemberContextMenu(null);
                    }}
                  >
                    <UserMinus size={15} aria-hidden="true" />
                    Remove from group
                  </button>
                ) : null}
              </div>
            ) : null}

            {memberRemovalError && !selectedChatMember ? (
              <p className="profile-error">{memberRemovalError}</p>
            ) : memberRemovalMessage && !selectedChatMember ? (
              <p className="profile-success">{memberRemovalMessage}</p>
            ) : null}

            {taggingMember ? (
              <div
                className="chat-info-nested-backdrop"
                role="presentation"
                onClick={closeMemberTagDialog}
              >
                <section
                  className="chat-info-nested-panel chat-members-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Add member tag"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="chat-info-nested-header">
                    <div>
                      <strong>Add member tag</strong>
                      <span>
                        Add short tag next to {getChatMemberDisplayName(taggingMember)}&apos;s
                        name.
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Close add member tag"
                      onClick={closeMemberTagDialog}
                    >
                      &times;
                    </button>
                  </div>
                  <form onSubmit={handleMemberTagSubmit}>
                    <input
                      value={memberTag}
                      maxLength={16}
                      placeholder="e.g. Moderator"
                      autoFocus
                      onChange={(event) => setMemberTag(event.target.value)}
                    />
                    <Button type="submit" disabled={memberTagSaving}>
                      {memberTagSaving ? "Adding..." : "Add tag"}
                    </Button>
                  </form>
                  {memberTagError ? (
                    <p className="profile-error">{memberTagError}</p>
                  ) : null}
                </section>
              </div>
            ) : null}

            {isAddingMember ? (
              <div
                className="chat-info-nested-backdrop"
                role="presentation"
                onClick={onCloseAddMember}
              >
                <section
                  className="chat-info-nested-panel chat-members-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Add group member"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="chat-info-nested-header">
                    <div>
                      <strong>Add member</strong>
                      <span>Anyone in this group can add another user.</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Close add member"
                      onClick={onCloseAddMember}
                    >
                      &times;
                    </button>
                  </div>
                  <form onSubmit={onAddMemberSubmit}>
                    <input
                      type="search"
                      value={addMemberQuery}
                      placeholder="Add member by username"
                      autoComplete="off"
                      onChange={(event) =>
                        onAddMemberQueryChange(event.target.value)
                      }
                    />
                    <Button type="submit" disabled={addMemberLoading}>
                      {addMemberLoading ? "Adding..." : "Add member"}
                    </Button>
                  </form>
                  {addMemberError ? (
                    <p className="profile-error">{addMemberError}</p>
                  ) : null}
                  {addMemberMessage ? (
                    <p className="profile-success">{addMemberMessage}</p>
                  ) : null}
                </section>
              </div>
            ) : null}

            {isManaging && canManageGroup ? (
              <GroupSettingsPanel
                chat={chat}
                members={members}
                canEditGroupInfo={canEditGroupInfo}
                canManageMembers={canManageMembers}
                canDeleteGroup={canDeleteGroup}
                permissionsDraft={memberPermissionsDraft}
                loading={memberPermissionsLoading}
                saving={memberPermissionsSaving}
                error={memberPermissionsError}
                message={memberPermissionsMessage}
                getChatMemberDisplayName={getChatMemberDisplayName}
                onClose={onCloseManage}
                onViewMemberProfile={onViewMemberProfile}
                onOpenMemberManagement={onOpenMemberManagement}
                onStartRemoveMember={onStartRemoveMember}
                onAddMemberTag={onAddMemberTag}
                onUpdateGroupProfile={onUpdateGroupProfile}
                onDeleteGroup={onDeleteGroup}
                onBooleanPermissionChange={onMemberBooleanPermissionChange}
                onNumericPermissionChange={onMemberNumericPermissionChange}
                onSave={onSaveMemberDefaultPermissions}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
