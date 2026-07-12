import { useEffect, useState } from "react";

import { Pin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatChatTime } from "@/lib/date-format";
import { getAssetUrl } from "@/lib/message-helpers";
import { keepSubtleScrollbarVisible } from "@/lib/scrollbar";
import type { Chat, UserProfile } from "@/types";

type ChatSidebarProps = {
  profileQuery: string;
  profileResult: UserProfile | null;
  profileError: string | null;
  profileLoading: boolean;
  chats: Chat[];
  activeChatId: number | null;
  draftRecipient: UserProfile | null;
  onProfileQueryChange: (value: string) => void;
  onClearProfileSearch: () => void;
  onMessageProfile: (profile: UserProfile) => void;
  onJoinChat: (chat: Chat) => void;
  onToggleChatPin: (chat: Chat) => void;
  onReorderPinnedChats: (chatIds: number[]) => void;
  getChatTitle: (chat: Chat) => string;
  getChatSubtitle: (chat: Chat) => string;
  onOpenCreateGroup: () => void;
};

type ChatMenuState = {
  chat: Chat;
  x: number;
  y: number;
};

function getChatMenuPosition(clientX: number, clientY: number) {
  const menuWidth = 150;
  const menuMaxHeight = 60;
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

function getProfileDisplayName(profile: UserProfile) {
  return `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`;
}

export function ChatSidebar({
  profileQuery,
  profileResult,
  profileError,
  profileLoading,
  chats,
  activeChatId,
  draftRecipient,
  onProfileQueryChange,
  onClearProfileSearch,
  onMessageProfile,
  onJoinChat,
  onToggleChatPin,
  onReorderPinnedChats,
  getChatTitle,
  getChatSubtitle,
  onOpenCreateGroup,
}: ChatSidebarProps) {
  const profileSearchActive = profileQuery.trim().length > 0;
  const [chatMenu, setChatMenu] = useState<ChatMenuState | null>(null);
  const [draggedPinnedChatId, setDraggedPinnedChatId] = useState<number | null>(
    null,
  );
  const [dragTargetPinnedChatId, setDragTargetPinnedChatId] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (!chatMenu) {
      return undefined;
    }

    function closeChatMenu() {
      setChatMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeChatMenu();
      }
    }

    document.addEventListener("click", closeChatMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", closeChatMenu, true);

    return () => {
      document.removeEventListener("click", closeChatMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", closeChatMenu, true);
    };
  }, [chatMenu]);

  function reorderPinnedChat(draggedChatId: number, targetChatId: number) {
    if (draggedChatId === targetChatId) {
      return;
    }

    const pinnedChatIds = chats
      .filter((chat) => chat.is_pinned)
      .map((chat) => chat.id);
    const draggedIndex = pinnedChatIds.indexOf(draggedChatId);
    const targetIndex = pinnedChatIds.indexOf(targetChatId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextPinnedChatIds = [...pinnedChatIds];
    const [draggedId] = nextPinnedChatIds.splice(draggedIndex, 1);
    nextPinnedChatIds.splice(targetIndex, 0, draggedId);
    onReorderPinnedChats(nextPinnedChatIds);
  }

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
                  src={getAssetUrl(profileResult.avatar_url)}
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
          <div className="sidebar-section-header">
            <div className="sidebar-section-label">Chats</div>
            <button
              type="button"
              className="sidebar-add-chat-button"
              aria-label="New group"
              title="New group"
              onClick={onOpenCreateGroup}
            >
              +
            </button>
          </div>
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
                draggedPinnedChatId === chat.id ? "dragging" : "",
                dragTargetPinnedChatId === chat.id ? "drag-over" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable={chat.is_pinned}
              onContextMenu={(event) => {
                event.preventDefault();
                setChatMenu({
                  chat,
                  ...getChatMenuPosition(event.clientX, event.clientY),
                });
              }}
              onDragStart={(event) => {
                if (!chat.is_pinned) {
                  event.preventDefault();
                  return;
                }

                setChatMenu(null);
                setDraggedPinnedChatId(chat.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(chat.id));
              }}
              onDragOver={(event) => {
                if (!chat.is_pinned || draggedPinnedChatId === null) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragTargetPinnedChatId(chat.id);
              }}
              onDragLeave={() => {
                if (dragTargetPinnedChatId === chat.id) {
                  setDragTargetPinnedChatId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedChatId = Number(
                  event.dataTransfer.getData("text/plain"),
                );

                if (chat.is_pinned && Number.isInteger(draggedChatId)) {
                  reorderPinnedChat(draggedChatId, chat.id);
                }

                setDraggedPinnedChatId(null);
                setDragTargetPinnedChatId(null);
              }}
              onDragEnd={() => {
                setDraggedPinnedChatId(null);
                setDragTargetPinnedChatId(null);
              }}
            >
              <button
                type="button"
                className="chat-open-button"
                onClick={() => {
                  setChatMenu(null);
                  onJoinChat(chat);
                }}
              >
                <img
                  src={getAssetUrl(chat.display_avatar_url || chat.avatar_url)}
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
                  <span className="chat-preview-row">
                    <small>{getChatSubtitle(chat)}</small>
                    {chat.is_pinned ? (
                      <Pin
                        className="chat-row-pin"
                        size={13}
                        aria-label="Pinned chat"
                      />
                    ) : null}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
        {draftRecipient ? (
          <div className="chat-list-item active">
            <button className="chat-open-button" type="button">
              <img
                src={getAssetUrl(draftRecipient.avatar_url)}
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
        {chatMenu ? (
          <div
            className="chat-context-menu"
            role="menu"
            style={{ left: chatMenu.x, top: chatMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleChatPin(chatMenu.chat);
                setChatMenu(null);
              }}
            >
              {chatMenu.chat.is_pinned ? "Unpin" : "Pin"}
            </button>
          </div>
        ) : null}
      </div>
        </>
      )}
    </aside>
  );
}
