import { Pin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateGroupPanel } from "@/components/chat/CreateGroupPanel";
import { formatChatTime } from "@/lib/date-format";
import { keepSubtleScrollbarVisible } from "@/lib/scrollbar";
import type { AuthUser, Chat, UserProfile } from "@/types";

type ChatSidebarProps = {
  user: AuthUser;
  profileQuery: string;
  profileResult: UserProfile | null;
  profileError: string | null;
  profileLoading: boolean;
  chats: Chat[];
  activeChatId: number | null;
  draftRecipient: UserProfile | null;
  creatingGroup: boolean;
  groupTitle: string;
  groupDescription: string;
  groupAvatarUrl: string;
  groupMemberQuery: string;
  groupSelectedMembers: UserProfile[];
  groupMemberLoading: boolean;
  groupCreating: boolean;
  groupError: string | null;
  groupMessage: string | null;
  onToggleProfileEditor: () => void;
  onSignOut: () => void;
  onProfileQueryChange: (value: string) => void;
  onClearProfileSearch: () => void;
  onMessageProfile: (profile: UserProfile) => void;
  onJoinChat: (chat: Chat) => void;
  onToggleChatPin: (chat: Chat) => void;
  getChatTitle: (chat: Chat) => string;
  getChatSubtitle: (chat: Chat) => string;
  onOpenCreateGroup: () => void;
  onCloseCreateGroup: () => void;
  onGroupTitleChange: (value: string) => void;
  onGroupDescriptionChange: (value: string) => void;
  onGroupAvatarUrlChange: (value: string) => void;
  onGroupMemberQueryChange: (value: string) => void;
  onAddSelectedGroupMember: () => void;
  onRemoveSelectedGroupMember: (memberId: number) => void;
  onCreateGroup: (event: React.FormEvent) => void;
};

function getProfileDisplayName(profile: UserProfile) {
  return `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`;
}

export function ChatSidebar({
  user,
  profileQuery,
  profileResult,
  profileError,
  profileLoading,
  chats,
  activeChatId,
  draftRecipient,
  creatingGroup,
  groupTitle,
  groupDescription,
  groupAvatarUrl,
  groupMemberQuery,
  groupSelectedMembers,
  groupMemberLoading,
  groupCreating,
  groupError,
  groupMessage,
  onToggleProfileEditor,
  onSignOut,
  onProfileQueryChange,
  onClearProfileSearch,
  onMessageProfile,
  onJoinChat,
  onToggleChatPin,
  getChatTitle,
  getChatSubtitle,
  onOpenCreateGroup,
  onCloseCreateGroup,
  onGroupTitleChange,
  onGroupDescriptionChange,
  onGroupAvatarUrlChange,
  onGroupMemberQueryChange,
  onAddSelectedGroupMember,
  onRemoveSelectedGroupMember,
  onCreateGroup,
}: ChatSidebarProps) {
  const profileSearchActive = profileQuery.trim().length > 0;

  return (
    <aside
      className={[
        "chat-sidebar",
        profileSearchActive ? "profile-search-mode" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Chats"
    >
      <div className="sidebar-profile">
        <div className="sidebar-profile-main">
          <img
            src={user.avatarUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.src = "/favicon.svg";
            }}
          />
          <div>
            <p>{user.firstName}</p>
            <span>@{user.username}</span>
          </div>
        </div>
        <div className="sidebar-profile-actions">
          <Button variant="outline" size="sm" onClick={onToggleProfileEditor}>
            Edit profile
          </Button>
          <Button variant="outline" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
      <section className="profile-search" aria-label="Search user profiles">
        <div className="profile-search-form">
          <span className="profile-search-prefix" aria-hidden="true">
            @
          </span>
          <input
            type="search"
            value={profileQuery}
            placeholder="Search users"
            autoComplete="off"
            onChange={(event) => onProfileQueryChange(event.target.value)}
          />
          {profileQuery ? (
            <button
              type="button"
              className="profile-search-clear"
              aria-label="Clear user search"
              onClick={onClearProfileSearch}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>
      {profileSearchActive ? (
        <>
          <div className="sidebar-section-label">Users</div>
          <div
            className="profile-search-results subtle-scrollbar"
            onScroll={keepSubtleScrollbarVisible}
          >
            {profileLoading ? (
              <p className="profile-search-status">Searching...</p>
            ) : null}
            {profileError ? <p className="profile-error">{profileError}</p> : null}
            {profileResult ? (
              <article className="profile-card">
                <img
                  src={profileResult.avatar_url}
                  alt=""
                  className="profile-avatar"
                />
                <div>
                  <h2>{getProfileDisplayName(profileResult)}</h2>
                  <p className="profile-username">@{profileResult.username}</p>
                  <span className="profile-status">{profileResult.status}</span>
                  {profileResult.bio ? (
                    <p className="profile-bio">{profileResult.bio}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onMessageProfile(profileResult)}
                >
                  Message
                </Button>
              </article>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <CreateGroupPanel
            isOpen={creatingGroup}
            title={groupTitle}
            description={groupDescription}
            avatarUrl={groupAvatarUrl}
            memberQuery={groupMemberQuery}
            selectedMembers={groupSelectedMembers}
            memberLoading={groupMemberLoading}
            creating={groupCreating}
            error={groupError}
            message={groupMessage}
            onOpen={onOpenCreateGroup}
            onClose={onCloseCreateGroup}
            onTitleChange={onGroupTitleChange}
            onDescriptionChange={onGroupDescriptionChange}
            onAvatarUrlChange={onGroupAvatarUrlChange}
            onMemberQueryChange={onGroupMemberQueryChange}
            onAddMember={onAddSelectedGroupMember}
            onRemoveMember={onRemoveSelectedGroupMember}
            onSubmit={onCreateGroup}
          />
          <div className="sidebar-section-label">Chats</div>
          <div
            className="chat-list subtle-scrollbar"
            onScroll={keepSubtleScrollbarVisible}
          >
            {chats.map((chat) => {
              const sentAt = formatChatTime(chat.last_message_created_at);
              const unreadCount =
                chat.unread_count > 99 ? "99+" : chat.unread_count;

          return (
            <div
              key={chat.id}
              className={[
                "chat-list-item",
                chat.id === activeChatId ? "active" : "",
                chat.is_pinned ? "pinned" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="chat-open-button"
                onClick={() => onJoinChat(chat)}
              >
                <img
                  src={chat.display_avatar_url || chat.avatar_url || "/favicon.svg"}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.src = "/favicon.svg";
                  }}
                />
                <span>
                  <span className="chat-title-row">
                    <strong>{getChatTitle(chat)}</strong>
                    <span className="chat-title-meta">
                      {chat.unread_count > 0 ? (
                        <span
                          className="unread-badge"
                          aria-label={`${chat.unread_count} unread messages`}
                        >
                          {unreadCount}
                        </span>
                      ) : null}
                      {sentAt && chat.last_message_created_at ? (
                        <time dateTime={chat.last_message_created_at}>{sentAt}</time>
                      ) : null}
                    </span>
                  </span>
                  <small>{getChatSubtitle(chat)}</small>
                </span>
              </button>
              <button
                type="button"
                className="chat-pin-button"
                aria-label={
                  chat.is_pinned
                    ? `Unpin ${getChatTitle(chat)}`
                    : `Pin ${getChatTitle(chat)}`
                }
                aria-pressed={chat.is_pinned}
                title={chat.is_pinned ? "Unpin" : "Pin"}
                onClick={() => onToggleChatPin(chat)}
              >
                <Pin size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        {draftRecipient ? (
          <div className="chat-list-item active">
            <button className="chat-open-button" type="button">
              <img
                src={draftRecipient.avatar_url}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = "/favicon.svg";
                }}
              />
              <span>
                <strong>{getProfileDisplayName(draftRecipient)}</strong>
                <small>New direct message</small>
              </span>
            </button>
          </div>
        ) : null}
      </div>
        </>
      )}
    </aside>
  );
}
