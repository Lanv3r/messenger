import { Fragment, type ReactNode, type RefObject } from "react";
import { Check, CheckCheck, ClockArrowUp, Pin } from "lucide-react";

import {
  formatMessageDay,
  formatMessageTime,
  isSameMessageDay,
} from "@/lib/date-format";
import {
  canCopyImageMessage,
  canCopyMessage,
  getMessageAttachments,
} from "@/lib/message-helpers";
import { keepSubtleScrollbarVisible } from "@/lib/scrollbar";
import type {
  Chat,
  ChatMessage,
  MessageDeliveryStatus,
  MessageReplyPreview,
} from "@/types";

type MessageMenuPosition = {
  x: number;
  y: number;
};

type MessageListProps = {
  messagesRef: RefObject<HTMLUListElement | null>;
  messages: ChatMessage[];
  currentUserId: number;
  activeChat: Chat | undefined;
  activeSearchResultId: number | null;
  openMessageMenuId: number | null;
  messageMenuPosition: MessageMenuPosition | null;
  currentUserCanDeleteGroupMessages: boolean;
  renderMessageBody: (entry: ChatMessage) => ReactNode;
  renderReplyPreview: (reply: MessageReplyPreview) => ReactNode;
  getSenderAvatar: (entry: ChatMessage) => string;
  getMessageDeliveryStatus: (entry: ChatMessage) => MessageDeliveryStatus;
  onOpenMessageMenu: (messageId: number, position: MessageMenuPosition) => void;
  onCopyMessage: (entry: ChatMessage) => void;
  onStartReply: (entry: ChatMessage) => void;
  onStartEdit: (entry: ChatMessage) => void;
  onOpenActionDialog: (kind: "pin" | "delete", entry: ChatMessage) => void;
};

const GROUPED_MESSAGE_WINDOW_MS = 5 * 60 * 1000;

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

export function MessageList({
  messagesRef,
  messages,
  currentUserId,
  activeChat,
  activeSearchResultId,
  openMessageMenuId,
  messageMenuPosition,
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
  return (
    <ul
      id="messages"
      ref={messagesRef}
      className="subtle-scrollbar"
      onScroll={keepSubtleScrollbarVisible}
    >
      {messages.length === 0 ? (
        <li className="empty-state">No messages yet in this chat.</li>
      ) : (
        messages.map((entry, index) => {
          const previousEntry = messages[index - 1];
          const nextEntry = messages[index + 1];
          const sentAt = formatMessageTime(entry.created_at);
          const dayLabel = formatMessageDay(entry.created_at);
          const showDaySeparator =
            !previousEntry ||
            !isSameMessageDay(previousEntry.created_at, entry.created_at);
          const deliveryStatus = getMessageDeliveryStatus(entry);
          const hasSharedPin = Boolean(entry.pinned_at);
          const hasPersonalPin = entry.is_pinned_for_me;
          const canUseMessageActions =
            Boolean(activeChat) &&
            !entry.temp_id &&
            entry.delivery_status !== "sending" &&
            entry.delivery_status !== "failed";
          const isMessageMenuOpen = openMessageMenuId === entry.id;
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
            showDaySeparator,
          );
          const isGroupedWithNext = nextEntry
            ? isGroupedWithPreviousMessage(
                nextEntry,
                entry,
                !isSameMessageDay(entry.created_at, nextEntry.created_at),
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
                  );
                }}
              >
                {isGroupedWithPrevious ? (
                  <span className="message-avatar-spacer" aria-hidden="true" />
                ) : (
                  <img
                    src={getSenderAvatar(entry)}
                    alt=""
                    className="message-avatar"
                    onError={(event) => {
                      event.currentTarget.src = "/favicon.svg";
                    }}
                  />
                )}
                <div className="message-copy">
                  {entry.reply_to ? renderReplyPreview(entry.reply_to) : null}
                  {renderMessageBody(entry)}
                  {hasSharedPin || hasPersonalPin ? (
                    <span className="message-pin-state">
                      <Pin size={12} aria-hidden="true" />
                      {hasSharedPin ? "Pinned in chat" : null}
                      {hasSharedPin && hasPersonalPin ? " · " : null}
                      {hasPersonalPin ? "Pinned for me" : null}
                    </span>
                  ) : null}
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
                          {canCopyMessage(entry) ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => onCopyMessage(entry)}
                            >
                              {canCopyImageMessage(entry) ? "Copy Image" : "Copy"}
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
                  <span className="message-meta">
                    {sentAt && entry.created_at ? (
                      <time dateTime={entry.created_at}>{sentAt}</time>
                    ) : null}
                    {entry.edited_at ? <span>edited</span> : null}
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
    </ul>
  );
}
