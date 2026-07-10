import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { GroupSettingsPanel } from "@/components/chat/GroupSettingsPanel";
import { getAssetUrl } from "@/lib/message-helpers";
import type { AuthUser, Chat, ChatMember, MemberPermissions } from "@/types";

type GroupInfoPanelProps = {
  chat: Chat;
  user: AuthUser;
  members: ChatMember[];
  loading: boolean;
  error: string | null;
  isAddingMember: boolean;
  isManaging: boolean;
  canManageMembers: boolean;
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
  onOpenMemberProfile: (member: ChatMember) => void;
  onStartRemoveMember: (member: ChatMember) => void;
  onAddMemberQueryChange: (value: string) => void;
  onAddMemberSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMemberBooleanPermissionChange: (key: string, value: boolean) => void;
  onMemberNumericPermissionChange: (key: string, value: number) => void;
  onSaveMemberDefaultPermissions: () => void;
};

export function GroupInfoPanel({
  chat,
  user,
  members,
  loading,
  error,
  isAddingMember,
  isManaging,
  canManageMembers,
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
  onOpenMemberProfile,
  onStartRemoveMember,
  onAddMemberQueryChange,
  onAddMemberSubmit,
  onMemberBooleanPermissionChange,
  onMemberNumericPermissionChange,
  onSaveMemberDefaultPermissions,
}: GroupInfoPanelProps) {
  return (
    <div
      className="chat-info-backdrop"
      role="presentation"
      onClick={onCloseTopmost}
    >
      <section
        className="chat-info-panel"
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

        <div className="chat-info-hero">
          <img
            src={getAssetUrl(chat.display_avatar_url || chat.avatar_url)}
            alt=""
            onError={(event) => {
              event.currentTarget.src = "/favicon.svg";
            }}
          />
          <strong>{getChatTitle(chat)}</strong>
          {chat.description ? <span>{chat.description}</span> : null}
        </div>

        <div className="chat-info-actions">
          {canManageMembers ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenManage}
            >
              Manage
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled
            title="Leaving groups is not implemented yet."
          >
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
              {members.map((member) => (
                <div
                  className={[
                    "chat-member-row",
                    canManageMembers &&
                    member.user_id !== user.userId &&
                    member.role !== "owner"
                      ? "can-remove"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={member.user_id}
                >
                  <button
                    type="button"
                    className="chat-member-main"
                    onClick={() => onOpenMemberProfile(member)}
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
                        {member.user_id === user.userId ? " (You)" : ""}
                      </strong>
                      <span>@{member.username}</span>
                    </div>
                  </button>
                  <div className="chat-member-side">
                    {canManageMembers &&
                    member.user_id !== user.userId &&
                    member.role !== "owner" ? (
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
                    <small>{member.role}</small>
                  </div>
                </div>
              ))}
            </div>

            {memberRemovalError && !selectedChatMember ? (
              <p className="profile-error">{memberRemovalError}</p>
            ) : memberRemovalMessage && !selectedChatMember ? (
              <p className="profile-success">{memberRemovalMessage}</p>
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

            {isManaging && canManageMembers ? (
              <GroupSettingsPanel
                canManageMembers={canManageMembers}
                permissionsDraft={memberPermissionsDraft}
                loading={memberPermissionsLoading}
                saving={memberPermissionsSaving}
                error={memberPermissionsError}
                message={memberPermissionsMessage}
                onClose={onCloseManage}
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
