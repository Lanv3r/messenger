import { useEffect, useRef, useState } from "react";

import { Eraser, LogOut, Pin, Trash2, X } from "lucide-react";

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
  onViewProfile: (profile: UserProfile) => void;
  onJoinChat: (chat: Chat) => void;
  onToggleChatPin: (chat: Chat) => void;
  onDeleteChat: (chat: Chat) => void;
  onClearHistory: (chat: Chat) => void;
  onLeaveGroup: (chat: Chat) => void;
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
  const menuMaxHeight = 144;
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

function clearsGroupHistory(chat: Chat) {
  return chat.type === "group" && chat.member_count >= 2;
}

function canClearHistory(chat: Chat) {
  return (
    chat.type === "self" || chat.type === "direct" || clearsGroupHistory(chat)
  );
}

function areChatIdListsEqual(first: number[], second: number[]) {
  return (
    first.length === second.length &&
    first.every((chatId, index) => chatId === second[index])
  );
}

function moveChatIdToIndex(
  chatIds: number[],
  draggedChatId: number,
  targetIndex: number,
) {
  const draggedIndex = chatIds.indexOf(draggedChatId);

  if (
    draggedIndex === -1 ||
    targetIndex < 0 ||
    targetIndex >= chatIds.length ||
    draggedIndex === targetIndex
  ) {
    return chatIds;
  }

  const nextChatIds = [...chatIds];
  nextChatIds.splice(draggedIndex, 1);
  nextChatIds.splice(targetIndex, 0, draggedChatId);
  return nextChatIds;
}

type DragPreviewTarget = {
  chatId: number;
  translateY: number;
};

type DragPreviewState = {
  order: number[];
  translations: DragPreviewTarget[];
};

type PendingPinnedDrag = {
  chatId: number;
  pointerId: number;
  startClientY: number;
};

function areDragPreviewStatesEqual(
  first: DragPreviewState | null,
  second: DragPreviewState | null,
) {
  if (!first || !second) {
    return first === second;
  }

  return (
    areChatIdListsEqual(first.order, second.order) &&
    first.translations.length === second.translations.length &&
    first.translations.every((translation, index) => {
      const otherTranslation = second.translations[index];
      return (
        translation.chatId === otherTranslation.chatId &&
        translation.translateY === otherTranslation.translateY
      );
    })
  );
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
  onViewProfile,
  onJoinChat,
  onToggleChatPin,
  onDeleteChat,
  onClearHistory,
  onLeaveGroup,
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
  const [dragPreviewState, setDragPreviewState] =
    useState<DragPreviewState | null>(null);
  const [draggedChatTranslateY, setDraggedChatTranslateY] = useState(0);
  const [isPinnedDropSettling, setIsPinnedDropSettling] = useState(false);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatRowRefs = useRef(new Map<number, HTMLDivElement>());
  const dragStartRowRects = useRef(new Map<number, DOMRect>());
  const dragStartPinnedOrder = useRef<number[]>([]);
  const dragPointerOffsetY = useRef(0);
  const draggedPinnedChatIdRef = useRef<number | null>(null);
  const dragPreviewStateRef = useRef<DragPreviewState | null>(null);
  const pendingPinnedDrag = useRef<PendingPinnedDrag | null>(null);
  const dropSettlingAnimationFrame = useRef<number | null>(null);
  const suppressNextChatClick = useRef(false);

  function captureDragStartRowRects() {
    dragStartRowRects.current = new Map(
      Array.from(chatRowRefs.current.entries()).map(([chatId, element]) => [
        chatId,
        element.getBoundingClientRect(),
      ]),
    );
  }

  function setPinnedDragPreviewState(nextState: DragPreviewState | null) {
    dragPreviewStateRef.current = nextState;
    setDragPreviewState(nextState);
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

  useEffect(() => {
    return () => {
      if (dropSettlingAnimationFrame.current !== null) {
        window.cancelAnimationFrame(dropSettlingAnimationFrame.current);
      }
    };
  }, []);

  function settlePinnedDropAfterPaint() {
    if (dropSettlingAnimationFrame.current !== null) {
      window.cancelAnimationFrame(dropSettlingAnimationFrame.current);
    }

    dropSettlingAnimationFrame.current = window.requestAnimationFrame(() => {
      dropSettlingAnimationFrame.current = window.requestAnimationFrame(() => {
        dropSettlingAnimationFrame.current = null;
        setIsPinnedDropSettling(false);
      });
    });
  }

  function updatePinnedChatSwapPreview(draggedChatId: number, draggedTop: number) {
    const pinnedOrder = dragStartPinnedOrder.current;
    const draggedIndex = pinnedOrder.indexOf(draggedChatId);
    const draggedRect = dragStartRowRects.current.get(draggedChatId);

    if (draggedIndex === -1 || !draggedRect) {
      setPinnedDragPreviewState(null);
      return;
    }

    const draggedBottom = draggedTop + draggedRect.height;
    let targetIndex: number | null = null;
    let largestOverlap = 0;

    for (const [index, chatId] of pinnedOrder.entries()) {
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
        targetIndex = index;
      }
    }

    if (targetIndex === null) {
      setPinnedDragPreviewState(null);
      return;
    }

    const nextOrder = moveChatIdToIndex(pinnedOrder, draggedChatId, targetIndex);
    const translations = pinnedOrder.flatMap((chatId, originalIndex) => {
      if (chatId === draggedChatId) {
        return [];
      }

      const nextIndex = nextOrder.indexOf(chatId);

      if (nextIndex === -1 || nextIndex === originalIndex) {
        return [];
      }

      const originalRect = dragStartRowRects.current.get(chatId);
      const targetSlotChatId = pinnedOrder[nextIndex];
      const targetSlotRect = dragStartRowRects.current.get(targetSlotChatId);

      if (!originalRect || !targetSlotRect) {
        return [];
      }

      return [
        {
          chatId,
          translateY: targetSlotRect.top - originalRect.top,
        },
      ];
    });

    const nextPreviewState: DragPreviewState = {
      order: nextOrder,
      translations,
    };
    const current = dragPreviewStateRef.current;

    if (areDragPreviewStatesEqual(current, nextPreviewState)) {
      return;
    }

    setPinnedDragPreviewState(nextPreviewState);
  }

  function getPinnedChatOrderToCommit() {
    const previewState = dragPreviewStateRef.current;
    const draggedChatId = draggedPinnedChatIdRef.current;

    if (!previewState || draggedChatId === null) {
      return null;
    }

    const nextPinnedOrder = previewState.order;

    if (areChatIdListsEqual(dragStartPinnedOrder.current, nextPinnedOrder)) {
      return null;
    }

    return nextPinnedOrder;
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
    const nextPinnedOrder =
      draggedPinnedChatIdRef.current !== null
        ? getPinnedChatOrderToCommit()
        : null;

    if (draggedPinnedChatIdRef.current !== null) {
      suppressNextChatClick.current = true;
    }

    if (nextPinnedOrder) {
      setIsPinnedDropSettling(true);
    }

    clearPinnedDragState();

    if (nextPinnedOrder) {
      onReorderPinnedChats(nextPinnedOrder);
      settlePinnedDropAfterPaint();
    }
  }

  function clearPinnedDragState() {
    draggedPinnedChatIdRef.current = null;
    setDraggedPinnedChatId(null);
    setPinnedDragPreviewState(null);
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
            id="profile-user-search"
            name="profile-user-search"
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
              <button
                type="button"
                className="profile-card profile-search-result-card"
                onClick={() => onViewProfile(profileResult)}
              >
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
              </button>
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
            className={[
              "chat-list",
              "subtle-scrollbar",
              isPinnedDropSettling ? "pinned-drop-settling" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            ref={chatListRef}
            onScroll={keepSubtleScrollbarVisible}
          >
            {chats.map((chat) => {
              const sentAt = formatChatTime(chat.last_message_created_at);
              const unreadCount =
                chat.unread_count > 99 ? "99+" : chat.unread_count;
              const previewTranslation = dragPreviewState?.translations.find(
                (translation) => translation.chatId === chat.id,
              );

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
                  : previewTranslation
                  ? {
                      transform: `translateY(${previewTranslation.translateY}px)`,
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
            {canClearHistory(chatMenu.chat) ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClearHistory(chatMenu.chat);
                  setChatMenu(null);
                }}
              >
                <Eraser size={15} aria-hidden="true" />
                Clear history
              </button>
            ) : null}
            {!clearsGroupHistory(chatMenu.chat) ? (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  onDeleteChat(chatMenu.chat);
                  setChatMenu(null);
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                Delete chat
              </button>
            ) : null}
            {chatMenu.chat.type === "group" ? (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  onLeaveGroup(chatMenu.chat);
                  setChatMenu(null);
                }}
              >
                <LogOut size={15} aria-hidden="true" />
                Leave group
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
        </>
      )}
    </aside>
  );
}
