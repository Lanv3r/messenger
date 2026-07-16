import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  ImagePlus,
  Pencil,
  ShieldCheck,
  ShieldPlus,
  Tag,
  Trash2,
  UserMinus,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImagePreviewDialog } from "@/components/chat/ImagePreviewDialog";
import { sortChatMembers } from "@/lib/chat-helpers";
import { getAssetUrl } from "@/lib/message-helpers";
import {
  MEMBER_BOOLEAN_PERMISSION_KEYS,
  MEMBER_NUMERIC_PERMISSION_KEYS,
  PERMISSION_LABELS,
} from "@/lib/permissions";
import type {
  Chat,
  ChatMember,
  MemberManagementMode,
  MemberPermissions,
} from "@/types";

type GroupSettingsView = "overview" | "permissions" | "admins" | "members" | "actions";

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

type GroupSettingsPanelProps = {
  chat: Chat;
  members: ChatMember[];
  canEditGroupInfo: boolean;
  canManageMembers: boolean;
  canDeleteGroup: boolean;
  permissionsDraft: MemberPermissions | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  message: string | null;
  getChatMemberDisplayName: (member: ChatMember) => string;
  onClose: () => void;
  onViewMemberProfile: (member: ChatMember) => void;
  onOpenMemberManagement: (
    member: ChatMember,
    mode: MemberManagementMode,
  ) => void;
  onStartRemoveMember: (member: ChatMember) => void;
  onAddMemberTag: (member: ChatMember, tag: string) => Promise<ChatMember>;
  onUpdateGroupProfile: (
    title: string,
    description: string,
    avatar: File | null,
  ) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
  onBooleanPermissionChange: (key: string, value: boolean) => void;
  onNumericPermissionChange: (key: string, value: number) => void;
  onSave: () => void;
};

function GroupMemberList({
  members,
  getChatMemberDisplayName,
  onViewMemberProfile,
  onOpenMemberContextMenu,
}: Pick<
  GroupSettingsPanelProps,
  "getChatMemberDisplayName" | "onViewMemberProfile"
> & {
  members: ChatMember[];
  onOpenMemberContextMenu: (
    member: ChatMember,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
}) {
  return (
    <div className="chat-member-list group-settings-member-list">
      {sortChatMembers(members).map((member) => (
        <div
          className="chat-member-row"
          key={member.user_id}
          onContextMenu={(event) => onOpenMemberContextMenu(member, event)}
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
              <strong>{getChatMemberDisplayName(member)}</strong>
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
            {member.role === "owner" || member.role === "admin" ? (
              <small className={`chat-member-role-tag ${member.role}`}>
                {member.role}
              </small>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroupSettingsPanel({
  chat,
  members,
  canEditGroupInfo,
  canManageMembers,
  canDeleteGroup,
  permissionsDraft,
  loading,
  saving,
  error,
  message,
  getChatMemberDisplayName,
  onClose,
  onViewMemberProfile,
  onOpenMemberManagement,
  onStartRemoveMember,
  onAddMemberTag,
  onUpdateGroupProfile,
  onDeleteGroup,
  onBooleanPermissionChange,
  onNumericPermissionChange,
  onSave,
}: GroupSettingsPanelProps) {
  const [view, setView] = useState<GroupSettingsView>("overview");
  const [title, setTitle] = useState(chat.title ?? "");
  const [description, setDescription] = useState(chat.description ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [memberContextMenu, setMemberContextMenu] =
    useState<MemberContextMenu | null>(null);
  const memberContextMenuRef = useRef<HTMLDivElement | null>(null);
  const [taggingMember, setTaggingMember] = useState<ChatMember | null>(null);
  const [memberTag, setMemberTag] = useState("");
  const [memberTagError, setMemberTagError] = useState<string | null>(null);
  const [memberTagSaving, setMemberTagSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    setTitle(chat.title ?? "");
    setDescription(chat.description ?? "");
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
  }, [chat.avatar_url, chat.description, chat.id, chat.title]);

  useEffect(
    () => () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
      }
    },
    [],
  );

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

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", closeMemberContextMenu, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", closeMemberContextMenu, true);
    };
  }, [memberContextMenu]);

  const closeDeleteConfirmation = () => {
    if (!deleting) {
      setDeleteConfirmOpen(false);
    }
  };

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

  const handleMemberTagSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
    } catch (tagError) {
      setMemberTagError(
        tagError instanceof Error ? tagError.message : "Unable to add member tag.",
      );
    } finally {
      setMemberTagSaving(false);
    }
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
    }
    avatarObjectUrlRef.current = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreviewUrl(avatarObjectUrlRef.current);
    setProfileError(null);
    setProfileMessage(null);
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditGroupInfo || profileSaving) {
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      await onUpdateGroupProfile(title, description, avatarFile);
      setAvatarFile(null);
      setProfileMessage("Group profile updated.");
    } catch (updateError) {
      setProfileError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the group profile.",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    setProfileError(null);
    try {
      await onDeleteGroup();
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setProfileError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the group.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const avatarUrl =
    avatarPreviewUrl ?? getAssetUrl(chat.avatar_url || chat.display_avatar_url);
  const admins = members.filter(
    (member) => member.role === "owner" || member.role === "admin",
  );

  const renderHeader = (titleText: string, subtitle?: string) => (
    <div className="chat-info-nested-header group-settings-header">
      <div>
        <strong>{titleText}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {view === "overview" ? (
        <button type="button" aria-label="Close edit group" onClick={onClose}>
          &times;
        </button>
      ) : (
        <button
          type="button"
          aria-label="Back to group settings"
          onClick={() => setView("overview")}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  let content: ReactNode;
  if (view === "permissions") {
    content = (
      <>
        {renderHeader("Permissions")}
        <p className="member-permissions-prompt group-settings-permissions-prompt">
          What can members of this group do?
        </p>
        {loading ? <small className="group-settings-loading">Loading...</small> : null}
        {permissionsDraft ? (
          <div className="permission-list group-settings-permissions-list">
            {MEMBER_BOOLEAN_PERMISSION_KEYS.map((key) => (
              <label className="permission-row" key={key}>
                <span>{PERMISSION_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={permissionsDraft[key] === true}
                  disabled={!canManageMembers}
                  onChange={(event) =>
                    onBooleanPermissionChange(key, event.target.checked)
                  }
                />
              </label>
            ))}
            {MEMBER_NUMERIC_PERMISSION_KEYS.map((key) => (
              <label className="permission-row" key={key}>
                <span>{PERMISSION_LABELS[key]}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={Number(permissionsDraft[key] ?? 0)}
                  disabled={!canManageMembers}
                  onChange={(event) =>
                    onNumericPermissionChange(key, Number(event.target.value))
                  }
                />
              </label>
            ))}
          </div>
        ) : loading ? null : (
          <p className="message-search-empty">
            Permission defaults are not loaded.
          </p>
        )}
        {error ? <p className="profile-error">{error}</p> : null}
        {message ? <p className="profile-success">{message}</p> : null}
        <div className="group-settings-actions">
          <Button
            type="button"
            size="sm"
            className="text-action-button"
            disabled={saving || !permissionsDraft || !canManageMembers}
            onClick={onSave}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </>
    );
  } else if (view === "admins") {
    content = (
      <>
        {renderHeader("Admins")}
        {admins.length ? (
          <GroupMemberList
            members={admins}
            getChatMemberDisplayName={getChatMemberDisplayName}
            onViewMemberProfile={onViewMemberProfile}
            onOpenMemberContextMenu={(member, event) => {
              event.preventDefault();
              setMemberContextMenu({
                member,
                ...getMemberMenuPosition(event.clientX, event.clientY),
              });
            }}
          />
        ) : (
          <p className="message-search-empty">This group has no admins yet.</p>
        )}
      </>
    );
  } else if (view === "members") {
    content = (
      <>
        {renderHeader("Members")}
        <GroupMemberList
          members={members}
          getChatMemberDisplayName={getChatMemberDisplayName}
          onViewMemberProfile={onViewMemberProfile}
          onOpenMemberContextMenu={(member, event) => {
            event.preventDefault();
            setMemberContextMenu({
              member,
              ...getMemberMenuPosition(event.clientX, event.clientY),
            });
          }}
        />
      </>
    );
  } else if (view === "actions") {
    content = (
      <>
        {renderHeader("Recent actions")}
        <p className="group-settings-empty-state">
          Recent group actions will appear here.
        </p>
      </>
    );
  } else {
    content = (
      <>
        {renderHeader("Edit group")}
        <form
          id="group-settings-profile"
          className="group-settings-profile"
          onSubmit={handleProfileSubmit}
        >
          <input
            ref={fileInputRef}
            className="avatar-upload-native-input"
            type="file"
            accept="image/*"
            disabled={!canEditGroupInfo || profileSaving}
            onChange={handleAvatarChange}
          />
          <div className="group-settings-avatar-editor">
            <button
              type="button"
              className="group-settings-avatar-button"
              aria-label="View group avatar"
              title="View group avatar"
              onClick={() => setViewingAvatar(true)}
            >
              <img
                src={avatarUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = "/favicon.svg";
                }}
              />
            </button>
            {canEditGroupInfo ? (
              <button
                type="button"
                className="group-settings-avatar-change"
                disabled={profileSaving}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={14} aria-hidden="true" />
                Change
              </button>
            ) : null}
          </div>
          <div className="group-settings-profile-fields">
            <input
              aria-label="Group name"
              value={title}
              maxLength={128}
              disabled={!canEditGroupInfo || profileSaving}
              onChange={(event) => {
                setTitle(event.target.value);
                setProfileError(null);
                setProfileMessage(null);
              }}
            />
            <textarea
              aria-label="Group bio"
              value={description}
              maxLength={255}
              rows={1}
              placeholder="Add a group bio"
              disabled={!canEditGroupInfo || profileSaving}
              onChange={(event) => {
                setDescription(event.target.value);
                setProfileError(null);
                setProfileMessage(null);
              }}
            />
          </div>
        </form>
        {profileError ? <p className="profile-error">{profileError}</p> : null}
        {profileMessage ? <p className="profile-success">{profileMessage}</p> : null}
        <div className="group-settings-navigation">
          <button type="button" onClick={() => setView("permissions")}>
            <span className="group-settings-navigation-label">
              <ShieldCheck size={17} aria-hidden="true" />
              Permissions
            </span>
            <span className="group-settings-navigation-end">
              <ChevronRight size={17} aria-hidden="true" />
            </span>
          </button>
          <button type="button" onClick={() => setView("admins")}>
            <span className="group-settings-navigation-label">
              <ShieldCheck size={17} aria-hidden="true" />
              Admins
            </span>
            <span className="group-settings-navigation-end">
              <small>{admins.length}</small>
              <ChevronRight size={17} aria-hidden="true" />
            </span>
          </button>
          <button type="button" onClick={() => setView("members")}>
            <span className="group-settings-navigation-label">
              <UsersRound size={17} aria-hidden="true" />
              Members
            </span>
            <span className="group-settings-navigation-end">
              <small>{members.length}</small>
              <ChevronRight size={17} aria-hidden="true" />
            </span>
          </button>
          <button type="button" onClick={() => setView("actions")}>
            <span className="group-settings-navigation-label">
              <History size={17} aria-hidden="true" />
              Recent actions
            </span>
            <span className="group-settings-navigation-end">
              <ChevronRight size={17} aria-hidden="true" />
            </span>
          </button>
          {canDeleteGroup ? (
            <button
              type="button"
              className="danger"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <span className="group-settings-navigation-label">
                <Trash2 size={17} aria-hidden="true" />
                Delete group
              </span>
              <span className="group-settings-navigation-end">
                <ChevronRight size={17} aria-hidden="true" />
              </span>
            </button>
          ) : null}
        </div>
        {canEditGroupInfo ? (
          <div className="group-settings-editor-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-action-button"
              disabled={profileSaving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              form="group-settings-profile"
              className="text-action-button"
              disabled={profileSaving}
            >
              {profileSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="chat-info-nested-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`chat-info-nested-panel permissions-panel group-settings-panel group-settings-panel-${view}`}
        role="dialog"
        aria-modal="true"
        aria-label="Edit group"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </section>

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

      {taggingMember ? (
        <div
          className="chat-info-nested-backdrop"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            closeMemberTagDialog();
          }}
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
            {memberTagError ? <p className="profile-error">{memberTagError}</p> : null}
          </section>
        </div>
      ) : null}

      {viewingAvatar ? (
        <ImagePreviewDialog
          src={avatarUrl}
          alt="Group avatar"
          onClose={() => setViewingAvatar(false)}
        />
      ) : null}

      {deleteConfirmOpen ? (
        <div
          className="message-action-backdrop"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            closeDeleteConfirmation();
          }}
        >
          <section
            className="message-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Delete group"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="message-action-dialog-copy">
              <strong>Delete {chat.title || "this group"} for everyone?</strong>
              <p>This permanently removes the group, its members, and its messages.</p>
            </div>
            <div className="message-action-dialog-actions">
              <button
                type="button"
                className="text-action-button"
                disabled={deleting}
                onClick={closeDeleteConfirmation}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={deleting}
                onClick={() => void handleDeleteGroup()}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
