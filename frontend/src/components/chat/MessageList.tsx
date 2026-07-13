import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, CheckCheck, ClockArrowUp, Pin } from "lucide-react";

import {
  formatMessageFullTimestamp,
  formatMessageDay,
  formatMessageTime,
  isSameMessageDay,
} from "@/lib/date-format";
import {
  canCopyImageMessage,
  getAttachmentFileUrl,
  getMessageAttachments,
} from "@/lib/message-helpers";
import { keepSubtleScrollbarVisible } from "@/lib/scrollbar";
import type {
  Chat,
  ChatMessage,
  MessageCopyTarget,
  MessageDeliveryStatus,
  MessageReplyPreview,
} from "@/types";

type MessageMenuPosition = {
  x: number;
  y: number;
};

type MessageMetaTooltipPlacement =
  | "below-right"
  | "below-left"
  | "above-right"
  | "above-left";

type StickyGroupAvatar = {
  messageId: string;
  avatarUrl: string;
  mode: "fixed" | "flow";
};

type MessageListProps = {
  messagesRef: RefObject<HTMLUListElement | null>;
  messages: ChatMessage[];
  currentUserId: number;
  unreadSeparatorLastReadMessageId: number | null;
  activeChat: Chat | undefined;
  activeSearchResultId: number | null;
  openMessageMenuId: number | null;
  messageMenuPosition: MessageMenuPosition | null;
  messageMenuCopyTarget: MessageCopyTarget | null;
  currentUserCanDeleteGroupMessages: boolean;
  renderMessageBody: (entry: ChatMessage) => ReactNode;
  renderReplyPreview: (reply: MessageReplyPreview) => ReactNode;
  getSenderAvatar: (entry: ChatMessage) => string;
  getMessageDeliveryStatus: (entry: ChatMessage) => MessageDeliveryStatus;
  onOpenMessageMenu: (
    messageId: number,
    position: MessageMenuPosition,
    copyTarget: MessageCopyTarget | null,
  ) => void;
  onCopyMessage: (entry: ChatMessage, copyTarget: MessageCopyTarget | null) => void;
  onStartReply: (entry: ChatMessage) => void;
  onStartEdit: (entry: ChatMessage) => void;
  onOpenActionDialog: (kind: "pin" | "delete", entry: ChatMessage) => void;
};

const GROUPED_MESSAGE_WINDOW_MS = 5 * 60 * 1000;
const TOOLTIP_GAP_PX = 8;
const TOOLTIP_OFFSET_PX = 4;
const TOOLTIP_VIEWPORT_PADDING_PX = 12;

function getMessageTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isGroupedWithPreviousMessage(
  entry: ChatMessage,
  previousEntry: ChatMessage | undefined,
  showDaySeparator: boolean,
) {
  if (!previousEntry || showDaySeparator) {
    return false;
  }

  if (entry.sender_id === null || previousEntry.sender_id === null) {
    return false;
  }

  if (entry.sender_id !== previousEntry.sender_id) {
    return false;
  }

  const currentTimestamp = getMessageTimestamp(entry.created_at);
  const previousTimestamp = getMessageTimestamp(previousEntry.created_at);

  if (currentTimestamp === null || previousTimestamp === null) {
    return false;
  }

  const distanceMs = currentTimestamp - previousTimestamp;
  return distanceMs >= 0 && distanceMs <= GROUPED_MESSAGE_WINDOW_MS;
}

function getGroupedMessageEnd(startElement: HTMLElement) {
  let currentElement = startElement.nextElementSibling;

  while (currentElement instanceof HTMLElement) {
    if (currentElement.classList.contains("message-sequence-last")) {
      return currentElement;
    }

    if (!currentElement.classList.contains("message-sequence-inner")) {
      return null;
    }

    currentElement = currentElement.nextElementSibling;
  }

  return null;
}

function updateStickyGroupAvatar(container: HTMLUListElement) {
  const viewportRect = container.getBoundingClientRect();
  let stickyAvatar: (StickyGroupAvatar & {
    size: number;
    groupTop: number;
    groupOffsetTop: number;
  }) | null = null;

  for (const startElement of container.querySelectorAll<HTMLElement>(
    "li.message-sequence-first",
  )) {
    const endElement = getGroupedMessageEnd(startElement);

    if (!endElement) {
      continue;
    }

    const startRect = startElement.getBoundingClientRect();
    const endRect = endElement.getBoundingClientRect();

    if (
      startRect.top > viewportRect.bottom ||
      endRect.bottom <= viewportRect.bottom
    ) {
      continue;
    }

    const avatar = endElement.querySelector<HTMLImageElement>(
      ".message-avatar",
    );

    if (!avatar) {
      continue;
    }

    stickyAvatar = {
      messageId: endElement.dataset.messageId ?? avatar.currentSrc,
      avatarUrl: avatar.currentSrc || avatar.src,
      mode: "fixed",
      size: avatar.getBoundingClientRect().height,
      groupTop: startRect.top,
      groupOffsetTop: startElement.offsetTop,
    };
  }

  if (!stickyAvatar) {
    container.style.removeProperty("--sticky-group-avatar-fixed-top");
    container.style.removeProperty("--sticky-group-avatar-left");
    container.style.removeProperty("--sticky-group-avatar-flow-top");
    return null;
  }

  const fixedAvatarTop = viewportRect.bottom - stickyAvatar.size;

  if (stickyAvatar.groupTop > fixedAvatarTop) {
    stickyAvatar.mode = "flow";
    container.style.setProperty(
      "--sticky-group-avatar-flow-top",
      `${stickyAvatar.groupOffsetTop}px`,
    );
  } else {
    container.style.setProperty(
      "--sticky-group-avatar-fixed-top",
      `${fixedAvatarTop}px`,
    );
    container.style.setProperty(
      "--sticky-group-avatar-left",
      `${viewportRect.left}px`,
    );
  }

  return stickyAvatar;
}

function getTooltipBoundaryRect(boundaryElement: HTMLElement | null) {
  if (boundaryElement) {
    return boundaryElement.getBoundingClientRect();
  }

  return {
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
  };
}

function getMessageMetaTooltipPlacement(
  metaElement: HTMLElement,
  boundaryElement: HTMLElement | null,
): MessageMetaTooltipPlacement {
  const tooltip = metaElement.querySelector<HTMLElement>(
    ".message-meta-tooltip",
  );

  if (!tooltip) {
    return "below-right";
  }

  const metaRect = metaElement.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const boundaryRect = getTooltipBoundaryRect(boundaryElement);
  const belowSpace =
    boundaryRect.bottom -
    metaRect.bottom -
    TOOLTIP_GAP_PX -
    TOOLTIP_VIEWPORT_PADDING_PX;
  const aboveSpace =
    metaRect.top -
    boundaryRect.top -
    TOOLTIP_GAP_PX -
    TOOLTIP_VIEWPORT_PADDING_PX;
  const rightSpace =
    boundaryRect.right -
    metaRect.left -
    TOOLTIP_OFFSET_PX -
    TOOLTIP_VIEWPORT_PADDING_PX;
  const leftSpace =
    metaRect.right -
    boundaryRect.left -
    TOOLTIP_OFFSET_PX -
    TOOLTIP_VIEWPORT_PADDING_PX;
  const verticalPlacement =
    belowSpace < tooltipRect.height && aboveSpace > belowSpace
      ? "above"
      : "below";
  const horizontalPlacement =
    rightSpace < tooltipRect.width && leftSpace > rightSpace ? "left" : "right";

  return `${verticalPlacement}-${horizontalPlacement}`;
}

function getMessageMenuPosition(clientX: number, clientY: number) {
  const menuWidth = 180;
  const menuMaxHeight = 280;
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

function getMessageCopyTarget(
  entry: ChatMessage,
  event: ReactMouseEvent,
): MessageCopyTarget | null {
  const target = event.target instanceof Element ? event.target : null;
  const attachments = getMessageAttachments(entry);
  const hasText = Boolean(entry.content);
  const attachmentElement = target?.closest<HTMLElement>(
    "[data-attachment-index]",
  );
  const attachmentIndex =
    attachmentElement?.dataset.attachmentIndex !== undefined
      ? Number(attachmentElement.dataset.attachmentIndex)
      : null;

  if (
    attachmentIndex !== null &&
    Number.isInteger(attachmentIndex) &&
    attachmentIndex >= 0
  ) {
    const attachment = attachments[attachmentIndex];

    if (
      attachment?.message_type === "image" &&
      getAttachmentFileUrl(attachment)
    ) {
      return { type: "image", attachmentIndex };
    }
  }

  if (target?.closest(".file-message-caption") && hasText) {
    return { type: "text" };
  }

  if (hasText && attachments.length > 0) {
    return { type: "text" };
  }

  if (canCopyImageMessage(entry)) {
    return { type: "image", attachmentIndex: 0 };
  }

  if (hasText) {
    return { type: "text" };
  }

  return null;
}

export function MessageList({
  messagesRef,
  messages,
  currentUserId,
  unreadSeparatorLastReadMessageId,
  activeChat,
  activeSearchResultId,
  openMessageMenuId,
  messageMenuPosition,
  messageMenuCopyTarget,
  currentUserCanDeleteGroupMessages,
  renderMessageBody,
  renderReplyPreview,
  getSenderAvatar,
  getMessageDeliveryStatus,
  onOpenMessageMenu,
  onCopyMessage,
  onStartReply,
  onStartEdit,
  onOpenActionDialog,
}: MessageListProps) {
  const [tooltipPlacements, setTooltipPlacements] = useState<
    Record<number, MessageMetaTooltipPlacement>
  >({});
  const [stickyGroupAvatar, setStickyGroupAvatar] =
    useState<StickyGroupAvatar | null>(null);
  const stickyAvatarFrameRef = useRef<number | null>(null);
  const firstUnreadMessageId =
    unreadSeparatorLastReadMessageId === null
      ? null
      : (messages.find(
          (entry) =>
            entry.sender_id !== currentUserId &&
            entry.delivery_status !== "sending" &&
            entry.delivery_status !== "failed" &&
            entry.id > unreadSeparatorLastReadMessageId,
        )?.id ?? null);

  function updateTooltipPlacement(
    messageId: number,
    metaElement: HTMLElement,
  ) {
    const placement = getMessageMetaTooltipPlacement(
      metaElement,
      messagesRef.current,
    );

    setTooltipPlacements((current) =>
      current[messageId] === placement
        ? current
        : { ...current, [messageId]: placement },
    );
  }

  useLayoutEffect(() => {
    const container = messagesRef.current;

    if (!container) {
      return;
    }

    const syncStickyGroupAvatar = () => {
      const nextAvatar = updateStickyGroupAvatar(container);

      setStickyGroupAvatar((current) =>
        current?.messageId === nextAvatar?.messageId &&
        current?.avatarUrl === nextAvatar?.avatarUrl &&
        current?.mode === nextAvatar?.mode
          ? current
          : nextAvatar,
      );
    };
    const animationFrame = window.requestAnimationFrame(syncStickyGroupAvatar);

    window.addEventListener("resize", syncStickyGroupAvatar);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (stickyAvatarFrameRef.current !== null) {
        window.cancelAnimationFrame(stickyAvatarFrameRef.current);
        stickyAvatarFrameRef.current = null;
      }
      window.removeEventListener("resize", syncStickyGroupAvatar);
    };
  }, [activeChat?.id, messages, messagesRef, unreadSeparatorLastReadMessageId]);

  return (
    <ul
      id="messages"
      ref={messagesRef}
      className="subtle-scrollbar"
      onScroll={(event) => {
        keepSubtleScrollbarVisible(event);

        if (stickyAvatarFrameRef.current !== null) {
          return;
        }

        const container = event.currentTarget;
        stickyAvatarFrameRef.current = window.requestAnimationFrame(() => {
          stickyAvatarFrameRef.current = null;

          const nextAvatar = updateStickyGroupAvatar(container);

          setStickyGroupAvatar((current) =>
            current?.messageId === nextAvatar?.messageId &&
            current?.avatarUrl === nextAvatar?.avatarUrl &&
            current?.mode === nextAvatar?.mode
              ? current
              : nextAvatar,
          );
        });
      }}
    >
      {messages.length === 0 ? (
        <li className="empty-state">No messages yet in this chat.</li>
      ) : (
        messages.map((entry, index) => {
          const previousEntry = messages[index - 1];
          const nextEntry = messages[index + 1];
          const showUnreadSeparator = entry.id === firstUnreadMessageId;
          const sentAt = formatMessageTime(entry.created_at);
          const sentAtFull = formatMessageFullTimestamp(entry.created_at);
          const editedAtFull = formatMessageFullTimestamp(entry.edited_at);
          const dayLabel = formatMessageDay(entry.created_at);
          const showDaySeparator =
            !previousEntry ||
            !isSameMessageDay(previousEntry.created_at, entry.created_at);
          const deliveryStatus = getMessageDeliveryStatus(entry);
          const tooltipPlacement =
            tooltipPlacements[entry.id] ?? "below-right";
          const hasSharedPin = Boolean(entry.pinned_at);
          const hasPersonalPin = entry.is_pinned_for_me;
          const canUseMessageActions =
            Boolean(activeChat) &&
            !entry.temp_id &&
            entry.delivery_status !== "sending" &&
            entry.delivery_status !== "failed";
          const isMessageMenuOpen = openMessageMenuId === entry.id;
          const copyTarget = isMessageMenuOpen ? messageMenuCopyTarget : null;
          const canDeleteGroupMessage =
            activeChat?.type === "group" &&
            (entry.sender_id === currentUserId ||
              currentUserCanDeleteGroupMessages);
          const attachments = getMessageAttachments(entry);
          const canEditMessage =
            canUseMessageActions &&
            entry.sender_id === currentUserId &&
            (entry.message_type === "text"
              ? entry.content !== null
              : attachments.length > 0);
          const isVisualMediaMessage =
            attachments.length > 0 &&
            attachments.every(
              (attachment) =>
                attachment.message_type === "image" ||
                attachment.message_type === "video",
            );
          const hasVisualMediaCaption =
            isVisualMediaMessage && Boolean(entry.content);
          const isGroupedWithPrevious = isGroupedWithPreviousMessage(
            entry,
            previousEntry,
            showDaySeparator || showUnreadSeparator,
          );
          const nextShowsUnreadSeparator = nextEntry?.id === firstUnreadMessageId;
          const isGroupedWithNext = nextEntry
            ? isGroupedWithPreviousMessage(
                nextEntry,
                entry,
                !isSameMessageDay(entry.created_at, nextEntry.created_at) ||
                  nextShowsUnreadSeparator,
              )
            : false;
          const sequenceClass =
            isGroupedWithPrevious && isGroupedWithNext
              ? "message-sequence-inner"
              : isGroupedWithNext
                ? "message-sequence-first"
                : isGroupedWithPrevious
                  ? "message-sequence-last"
                  : "";
          const messageKey = `${entry.sender_id ?? "system"}-${
            entry.id ?? index
          }`;

          return (
            <Fragment key={messageKey}>
              {showDaySeparator && dayLabel ? (
                <li className="message-day-separator">{dayLabel}</li>
              ) : null}
              {showUnreadSeparator ? (
                <li className="message-unread-separator">
                  <span>Unread messages</span>
                </li>
              ) : null}

              <li
                className={[
                  entry.sender_id === currentUserId || entry.isOwn
                    ? "you"
                    : "server",
                  entry.id === activeSearchResultId ? "search-highlight" : "",
                  isVisualMediaMessage ? "media-message" : "",
                  hasVisualMediaCaption ? "media-with-caption" : "",
                  isGroupedWithPrevious ? "grouped-with-previous" : "",
                  sequenceClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-message-id={entry.id}
                onContextMenu={(event) => {
                  if (!canUseMessageActions) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  onOpenMessageMenu(
                    entry.id,
                    getMessageMenuPosition(event.clientX, event.clientY),
                    getMessageCopyTarget(entry, event),
                  );
                }}
              >
                {isGroupedWithNext ? (
                  <span className="message-avatar-spacer" aria-hidden="true" />
                ) : (
                  <img
                    src={getSenderAvatar(entry)}
                    alt=""
                    className={[
                      "message-avatar",
                      stickyGroupAvatar?.messageId === String(entry.id)
                        ? "sticky-group-avatar-source"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onError={(event) => {
                      event.currentTarget.src = "/favicon.svg";
                    }}
                  />
                )}
                <div
                  className={[
                    "message-copy",
                    hasSharedPin || hasPersonalPin ? "pinned-message" : "",
                    entry.edited_at ? "edited-message" : "",
                    deliveryStatus ? "with-status" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {entry.reply_to ? renderReplyPreview(entry.reply_to) : null}
                  {renderMessageBody(entry)}
                  {canUseMessageActions ? (
                    <span
                      className={[
                        "message-actions",
                        isMessageMenuOpen ? "open" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {isMessageMenuOpen ? (
                        <span
                          className="message-context-menu"
                          role="menu"
                          style={
                            messageMenuPosition
                              ? {
                                  left: messageMenuPosition.x,
                                  top: messageMenuPosition.y,
                                }
                              : undefined
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          {copyTarget ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => onCopyMessage(entry, copyTarget)}
                            >
                              {copyTarget.type === "image"
                                ? "Copy Image"
                                : "Copy Text"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => onStartReply(entry)}
                          >
                            Reply
                          </button>
                          {canEditMessage ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => onStartEdit(entry)}
                            >
                              Edit
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => onOpenActionDialog("pin", entry)}
                          >
                            {hasPersonalPin || hasSharedPin ? "Unpin" : "Pin"}
                          </button>
                          {activeChat?.type === "group" ? (
                            canDeleteGroupMessage ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  onOpenActionDialog("delete", entry)
                                }
                              >
                                Delete
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                onOpenActionDialog("delete", entry)
                              }
                            >
                              Delete
                            </button>
                          )}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  <span
                    className={[
                      "message-meta",
                      entry.edited_at ? `tooltip-${tooltipPlacement}` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseEnter={(event) => {
                      if (entry.edited_at) {
                        updateTooltipPlacement(entry.id, event.currentTarget);
                      }
                    }}
                    onFocus={(event) => {
                      if (entry.edited_at) {
                        updateTooltipPlacement(entry.id, event.currentTarget);
                      }
                    }}
                  >
                    {hasSharedPin || hasPersonalPin ? (
                      <Pin
                        className="message-meta-pin"
                        size={12}
                        aria-label={
                          hasSharedPin ? "Pinned in chat" : "Pinned for me"
                        }
                      />
                    ) : null}
                    {sentAt && entry.created_at ? (
                      <time dateTime={entry.created_at}>
                        {entry.edited_at ? `edited ${sentAt}` : sentAt}
                      </time>
                    ) : null}
                    {entry.edited_at && sentAtFull && editedAtFull ? (
                      <span className="message-meta-tooltip" role="tooltip">
                        <span>Sent: {sentAtFull}</span>
                        <span>Edited: {editedAtFull}</span>
                      </span>
                    ) : null}
                    {deliveryStatus ? (
                      <span
                        className={`message-status ${deliveryStatus.kind}`}
                        aria-label={deliveryStatus.label}
                        title={deliveryStatus.label}
                      >
                        {deliveryStatus.kind === "sending" ? (
                          <ClockArrowUp size={14} aria-hidden="true" />
                        ) : null}
                        {deliveryStatus.kind === "sent" ? (
                          <Check size={15} aria-hidden="true" />
                        ) : null}
                        {deliveryStatus.kind === "read" ? (
                          <CheckCheck size={16} aria-hidden="true" />
                        ) : null}
                        {deliveryStatus.kind === "failed" ? (
                          <span aria-hidden="true">!</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            </Fragment>
          );
        })
      )}
      {stickyGroupAvatar ? (
        <li
          className={`sticky-group-avatar ${stickyGroupAvatar.mode}`}
          aria-hidden="true"
        >
          <img src={stickyGroupAvatar.avatarUrl} alt="" />
        </li>
      ) : null}
    </ul>
  );
}
