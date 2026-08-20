import { getVisibleMessages } from "@/lib/chat-helpers";
import { formatChatTime } from "@/lib/date-format";
import { getAssetUrl } from "@/lib/message-helpers";
import type {
  AuthUser,
  Chat,
  ChatMessage,
  MessageDeliveryStatus,
  MessageReplyPreview,
} from "@/types";

type UseMessageDisplayOptions = {
  user: AuthUser;
  activeChat: Chat | undefined;
  activeChatId: number | null;
  messages: ChatMessage[];
};

export function useMessageDisplay({
  user,
  activeChat,
  activeChatId,
  messages,
}: UseMessageDisplayOptions) {
  const visibleMessages = getVisibleMessages(messages, activeChatId);
  const otherLastReadMessageId = activeChat?.other_last_read_message_id;
  const latestOwnReadMessageId =
    otherLastReadMessageId === null ||
    otherLastReadMessageId === undefined
      ? null
      : visibleMessages.reduce<number | null>((latestMessageId, entry) => {
          if (
            entry.sender_id !== user.userId ||
            entry.delivery_status === "sending" ||
            entry.delivery_status === "failed" ||
            entry.id > otherLastReadMessageId
          ) {
            return latestMessageId;
          }

          return latestMessageId === null || entry.id > latestMessageId
            ? entry.id
            : latestMessageId;
        }, null);

  function getReplySenderName(reply: MessageReplyPreview) {
    if (reply.message_type === "deleted") {
      return "Original message";
    }

    if (reply.sender_id === user.userId) {
      return "You";
    }

    if (reply.sender_id === null) {
      return "System";
    }

    return reply.sender_username ?? `User ${reply.sender_id}`;
  }

  function getSenderName(
    entry: Pick<ChatMessage, "sender_id" | "sender_username">,
  ) {
    if (entry.sender_id === user.userId) {
      return "You";
    }

    if (entry.sender_id === null) {
      return "System";
    }

    return entry.sender_username ?? `User ${entry.sender_id}`;
  }

  function getSenderAvatar(entry: ChatMessage) {
    if (entry.sender_id === user.userId) {
      return user.avatarUrl;
    }

    return getAssetUrl(entry.sender_avatar_url);
  }

  function getMessageDeliveryStatus(
    entry: ChatMessage,
  ): MessageDeliveryStatus {
    if (entry.sender_id !== user.userId) {
      return null;
    }

    if (entry.delivery_status === "sending") {
      return { kind: "sending", label: "Sending" };
    }

    if (entry.delivery_status === "failed") {
      return { kind: "failed", label: "Failed" };
    }

    if (activeChat?.type === "self") {
      return { kind: "read", label: "Read" };
    }

    if (activeChat?.type === "group") {
      return entry.read_by_anyone
        ? { kind: "read", label: "Read" }
        : { kind: "sent", label: "Sent" };
    }

    if (
      otherLastReadMessageId !== null &&
      otherLastReadMessageId !== undefined &&
      entry.id <= otherLastReadMessageId
    ) {
      if (
        entry.id === latestOwnReadMessageId &&
        activeChat?.other_last_read_at
      ) {
        const readAt = formatChatTime(activeChat.other_last_read_at);
        return {
          kind: "read",
          label: readAt ? `Read ${readAt}` : "Read",
        };
      }

      return { kind: "read", label: "Read" };
    }

    return { kind: "sent", label: "Sent" };
  }

  return {
    visibleMessages,
    getReplySenderName,
    getSenderName,
    getSenderAvatar,
    getMessageDeliveryStatus,
  };
}
