import { useEffect, useRef, useState } from "react";

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

function getPinnedChatIds(chats: Chat[]) {
  return chats.filter((chat) => chat.is_pinned).map((chat) => chat.id);
}

function areChatIdListsEqual(first: number[], second: number[]) {
  return (
    first.length === second.length &&
    first.every((chatId, index) => chatId === second[index])
  );
}

function swapChatIds(
  chatIds: number[],
  draggedChatId: number,
  targetChatId: number,
) {
  const draggedIndex = chatIds.indexOf(draggedChatId);
  const targetIndex = chatIds.indexOf(targetChatId);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return chatIds;
  }

  const nextChatIds = [...chatIds];
  nextChatIds[draggedIndex] = targetChatId;
  nextChatIds[targetIndex] = draggedChatId;
  return nextChatIds;
}

type DragPreviewTarget = {
  chatId: number;
  translateY: number;
};

type PendingPinnedDrag = {
  chatId: number;
  pointerId: number;
  startClientY: number;
};

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
  const [dragPreviewTarget, setDragPreviewTarget] =
    useState<DragPreviewTarget | null>(null);
  const [draggedChatTranslateY, setDraggedChatTranslateY] = useState(0);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatRowRefs = useRef(new Map<number, HTMLDivElement>());
  const dragStartRowRects = useRef(new Map<number, DOMRect>());
  const dragStartPinnedOrder = useRef<number[]>([]);
  const dragPointerOffsetY = useRef(0);
  const draggedPinnedChatIdRef = useRef<number | null>(null);
  const dragPreviewTargetRef = useRef<DragPreviewTarget | null>(null);
  const pendingPinnedDrag = useRef<PendingPinnedDrag | null>(null);
  const suppressNextChatClick = useRef(false);

  function captureDragStartRowRects() {
    dragStartRowRects.current = new Map(
      Array.from(chatRowRefs.current.entries()).map(([chatId, element]) => [
        chatId,
        element.getBoundingClientRect(),
      ]),
    );
  }

  function setPinnedDragPreviewTarget(nextTarget: DragPreviewTarget | null) {
    dragPreviewTargetRef.current = nextTarget;
    setDragPreviewTarget(nextTarget);
  }

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

  function updatePinnedChatSwapPreview(draggedChatId: number, draggedTop: number) {
    const pinnedOrder = dragStartPinnedOrder.current;
    const draggedIndex = pinnedOrder.indexOf(draggedChatId);
    const draggedRect = dragStartRowRects.current.get(draggedChatId);

    if (draggedIndex === -1 || !draggedRect) {
      setPinnedDragPreviewTarget(null);
      return;
    }

    const draggedBottom = draggedTop + draggedRect.height;
    let nextPreviewTarget: DragPreviewTarget | null = null;
    let largestOverlap = 0;

    for (const chatId of pinnedOrder) {
      if (chatId === draggedChatId) {
        continue;
      }

      const targetRect = dragStartRowRects.current.get(chatId);

      if (!targetRect) {
        continue;
      }

      const overlap = Math.max(
        0,
        Math.min(draggedBottom, targetRect.bottom) -
          Math.max(draggedTop, targetRect.top),
      );

      if (overlap >= targetRect.height / 2 && overlap > largestOverlap) {
        largestOverlap = overlap;
        nextPreviewTarget = {
          chatId,
          translateY: draggedRect.top - targetRect.top,
        };
      }
    }

    const current = dragPreviewTargetRef.current;

    if (
      current?.chatId === nextPreviewTarget?.chatId &&
      current?.translateY === nextPreviewTarget?.translateY
    ) {
      return;
    }

    setPinnedDragPreviewTarget(nextPreviewTarget);
  }

  function commitPinnedChatOrder() {
    const previewTarget = dragPreviewTargetRef.current;
    const draggedChatId = draggedPinnedChatIdRef.current;

    if (!previewTarget || draggedChatId === null) {
      return;
    }

    const nextPinnedOrder = swapChatIds(
      dragStartPinnedOrder.current,
      draggedChatId,
      previewTarget.chatId,
    );

    if (!areChatIdListsEqual(dragStartPinnedOrder.current, nextPinnedOrder)) {
      onReorderPinnedChats(nextPinnedOrder);
    }
  }

  function startPinnedPointerDrag(chatId: number, pointerY: number) {
    const draggedRect = dragStartRowRects.current.get(chatId);

    if (!draggedRect) {
      return;
    }

    setChatMenu(null);
    draggedPinnedChatIdRef.current = chatId;
    setDraggedPinnedChatId(chatId);
    dragPointerOffsetY.current = pointerY - draggedRect.top;
    updateDraggedPinnedChatPosition(chatId, pointerY);
  }

  function updateDraggedPinnedChatPosition(chatId: number, pointerY: number) {
    const draggedRect = dragStartRowRects.current.get(chatId);
    const chatListRect = chatListRef.current?.getBoundingClientRect();

    if (!draggedRect || !chatListRect) {
      return;
    }

    const unclampedTop = pointerY - dragPointerOffsetY.current;
    const clampedTop = Math.min(
      Math.max(unclampedTop, chatListRect.top),
      chatListRect.bottom - draggedRect.height,
    );
    const translateY = clampedTop - draggedRect.top;

    setDraggedChatTranslateY(translateY);
    updatePinnedChatSwapPreview(chatId, clampedTop);
  }

  function finishPinnedPointerDrag() {
    if (draggedPinnedChatIdRef.current !== null) {
      commitPinnedChatOrder();
      suppressNextChatClick.current = true;
    }

    clearPinnedDragState();
  }

  function clearPinnedDragState() {
    draggedPinnedChatIdRef.current = null;
    setDraggedPinnedChatId(null);
    setPinnedDragPreviewTarget(null);
    setDraggedChatTranslateY(0);
    dragStartPinnedOrder.current = [];
    dragStartRowRects.current = new Map();
    dragPointerOffsetY.current = 0;
    pendingPinnedDrag.current = null;
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
            ref={chatListRef}
            onScroll={keepSubtleScrollbarVisible}
          >
            {chats.map((chat) => {
              const sentAt = formatChatTime(chat.last_message_created_at);
              const unreadCount =
                chat.unread_count > 99 ? "99+" : chat.unread_count;

          return (
            <div
              key={chat.id}
              ref={(element) => {
                if (element) {
                  chatRowRefs.current.set(chat.id, element);
                } else {
                  chatRowRefs.current.delete(chat.id);
                }
              }}
              className={[
                "chat-list-item",
                chat.id === activeChatId ? "active" : "",
                chat.is_pinned ? "pinned" : "",
                draggedPinnedChatId === chat.id ? "dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                draggedPinnedChatId === chat.id
                  ? {
                      transform: `translateY(${draggedChatTranslateY}px)`,
                      zIndex: 2,
                    }
                  : dragPreviewTarget?.chatId === chat.id
                  ? {
                      transform: `translateY(${dragPreviewTarget.translateY}px)`,
                    }
                  : undefined
              }
              onContextMenu={(event) => {
                event.preventDefault();
                setChatMenu({
                  chat,
                  ...getChatMenuPosition(event.clientX, event.clientY),
                });
              }}
              onPointerDown={(event) => {
                if (!chat.is_pinned || event.button !== 0) {
                  return;
                }

                pendingPinnedDrag.current = {
                  chatId: chat.id,
                  pointerId: event.pointerId,
                  startClientY: event.clientY,
                };
                dragStartPinnedOrder.current = getPinnedChatIds(chats);
                captureDragStartRowRects();
              }}
              onPointerMove={(event) => {
                const pendingDrag = pendingPinnedDrag.current;

                if (
                  !pendingDrag ||
                  pendingDrag.chatId !== chat.id ||
                  pendingDrag.pointerId !== event.pointerId
                ) {
                  return;
                }

                if (draggedPinnedChatIdRef.current === null) {
                  const movedDistance = Math.abs(
                    event.clientY - pendingDrag.startClientY,
                  );

                  if (movedDistance < 4) {
                    return;
                  }

                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  startPinnedPointerDrag(chat.id, event.clientY);
                  return;
                }

                event.preventDefault();
                updateDraggedPinnedChatPosition(chat.id, event.clientY);
              }}
              onPointerUp={(event) => {
                const pendingDrag = pendingPinnedDrag.current;

                if (
                  !pendingDrag ||
                  pendingDrag.chatId !== chat.id ||
                  pendingDrag.pointerId !== event.pointerId
                ) {
                  return;
                }

                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                if (draggedPinnedChatIdRef.current !== null) {
                  event.preventDefault();
                }

                finishPinnedPointerDrag();
              }}
              onPointerCancel={() => {
                clearPinnedDragState();
              }}
            >
              <button
                type="button"
                className="chat-open-button"
                onClick={(event) => {
                  if (suppressNextChatClick.current) {
                    event.preventDefault();
                    suppressNextChatClick.current = false;
                    return;
                  }

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
