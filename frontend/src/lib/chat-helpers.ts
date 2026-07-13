import type { Chat, ChatActivityState, ChatActivityUser, ChatMessage } from "@/types";
import { getMessageAttachments } from "@/lib/message-helpers";

export function getChatSortTime(chat: Chat) {
  const value = chat.last_message_created_at ?? chat.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortChats(chats: Chat[]) {
  return [...chats].sort((first, second) => {
    const firstIsPinned = Boolean(first.is_pinned);
    const secondIsPinned = Boolean(second.is_pinned);

    if (firstIsPinned !== secondIsPinned) {
      return firstIsPinned ? -1 : 1;
    }

    if (firstIsPinned && secondIsPinned) {
      const firstPinnedOrder = first.pinned_order ?? Number.MAX_SAFE_INTEGER;
      const secondPinnedOrder = second.pinned_order ?? Number.MAX_SAFE_INTEGER;

      if (firstPinnedOrder !== secondPinnedOrder) {
        return firstPinnedOrder - secondPinnedOrder;
      }
    }

    return getChatSortTime(second) - getChatSortTime(first);
  });
}

export function getChatMessagePreviewText(
  message: Pick<ChatMessage, "content" | "message_type" | "metadata">,
) {
  const content = message.content?.trim();
  if (content) {
    return content;
  }

  const attachments = getMessageAttachments(message);
  if (attachments.length > 1) {
    const attachmentTypes = new Set(
      attachments.map((attachment) => attachment.message_type),
    );
    if (attachmentTypes.size === 1 && attachmentTypes.has("image")) {
      return `${attachments.length} photos`;
    }

    return `${attachments.length} attachments`;
  }

  if (message.message_type === "voice") {
    return "Voice message";
  }

  if (message.message_type === "image") {
    return "Photo";
  }

  if (message.message_type === "video") {
    return "Video";
  }

  if (message.message_type === "audio") {
    return "Audio file";
  }

  if (message.message_type === "file") {
    return "File";
  }

  return message.message_type === "text" ? null : message.message_type;
}

export function updateChatActivityState(
  current: Record<number, ChatActivityState>,
  chatId: number,
  user: ChatActivityUser,
  kind: keyof ChatActivityState,
  isActive: boolean,
) {
  const existing = current[chatId] ?? { typing: [], recording: [] };
  const nextUsers = isActive
    ? [
        ...existing[kind].filter((entry) => entry.user_id !== user.user_id),
        user,
      ]
    : existing[kind].filter((entry) => entry.user_id !== user.user_id);
  const nextState = {
    ...existing,
    [kind]: nextUsers,
  };

  if (nextState.typing.length === 0 && nextState.recording.length === 0) {
    const next = { ...current };
    delete next[chatId];
    return next;
  }

  return {
    ...current,
    [chatId]: nextState,
  };
}

export function upsertChat(chats: Chat[], chat: Chat) {
  const existingIndex = chats.findIndex((item) => item.id === chat.id);

  if (existingIndex === -1) {
    return sortChats([chat, ...chats]);
  }

  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1, chat);
  return sortChats(nextChats);
}

export function mergeChatMembershipUpdate(
  existingChat: Chat | undefined,
  chat: Chat,
) {
  if (!existingChat) {
    return chat;
  }

  return {
    ...existingChat,
    ...chat,
    last_message_id: chat.last_message_id ?? existingChat.last_message_id,
    last_message_text: chat.last_message_text ?? existingChat.last_message_text,
    last_message_sender_id:
      chat.last_message_sender_id ?? existingChat.last_message_sender_id,
    last_message_created_at:
      chat.last_message_created_at ?? existingChat.last_message_created_at,
    unread_count: existingChat.unread_count,
    current_last_read_message_id: existingChat.current_last_read_message_id,
    other_last_read_message_id: existingChat.other_last_read_message_id,
    other_last_read_at: existingChat.other_last_read_at,
    is_pinned: existingChat.is_pinned,
    pinned_order: existingChat.pinned_order,
  };
}

export function applyLastMessagePreview(chat: Chat, message: ChatMessage): Chat {
  return {
    ...chat,
    last_message_id: message.id,
    last_message_text: getChatMessagePreviewText(message),
    last_message_sender_id: message.sender_id,
    last_message_created_at: message.created_at,
    updated_at: message.updated_at ?? chat.updated_at,
  };
}

export function upsertChatPreview(
  chats: Chat[],
  chat: Chat,
  message: ChatMessage,
) {
  const nextChat = applyLastMessagePreview(chat, message);
  const existingIndex = chats.findIndex((item) => item.id === chat.id);

  if (existingIndex === -1) {
    return sortChats([nextChat, ...chats]);
  }

  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1);
  return sortChats([nextChat, ...nextChats]);
}

export function updateChatPreview(chats: Chat[], message: ChatMessage) {
  const existingChat = chats.find((chat) => chat.id === message.chat_id);

  if (!existingChat) {
    return chats;
  }

  return upsertChatPreview(chats, existingChat, message);
}

export function updateChatPreviewWithUnread(
  chats: Chat[],
  message: ChatMessage,
  currentUserId: number,
) {
  const existingChat = chats.find((chat) => chat.id === message.chat_id);

  if (!existingChat) {
    return chats;
  }

  const lastKnownMessageId = existingChat.last_message_id ?? 0;
  const isNewIncomingMessage =
    message.sender_id !== currentUserId &&
    message.delivery_status !== "sending" &&
    message.delivery_status !== "failed" &&
    message.id > lastKnownMessageId &&
    message.id > (existingChat.current_last_read_message_id ?? 0);
  const nextChat = {
    ...applyLastMessagePreview(existingChat, message),
    unread_count: isNewIncomingMessage
      ? existingChat.unread_count + 1
      : existingChat.unread_count,
  };
  const existingIndex = chats.findIndex((chat) => chat.id === message.chat_id);
  const nextChats = [...chats];

  nextChats.splice(existingIndex, 1);
  return sortChats([nextChat, ...nextChats]);
}

export function replaceTemporaryMessage(
  messages: ChatMessage[],
  tempId: string,
  nextMessage: ChatMessage,
) {
  return messages.map((message) =>
    message.temp_id === tempId ? nextMessage : message,
  );
}

export function getMessageTime(message: ChatMessage) {
  if (!message.created_at) {
    return 0;
  }

  const timestamp = new Date(message.created_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function compareMessages(first: ChatMessage, second: ChatMessage) {
  const timeDifference = getMessageTime(first) - getMessageTime(second);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return first.id - second.id;
}

export function getVisibleMessages(
  messages: ChatMessage[],
  activeChatId: number | null,
) {
  if (activeChatId === null) {
    return [];
  }

  return messages
    .filter((entry) => entry.chat_id === activeChatId)
    .sort(compareMessages);
}

export function getChatMemberDisplayName(member: {
  first_name: string;
  last_name: string | null;
}) {
  return `${member.first_name}${member.last_name ? ` ${member.last_name}` : ""}`;
}
