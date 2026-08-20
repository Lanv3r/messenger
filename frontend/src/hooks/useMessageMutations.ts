import type { Dispatch, SetStateAction } from "react";

import { apiFetch } from "@/lib/api";
import { getVisibleMessages } from "@/lib/chat-helpers";
import {
  getMessagePreviewText,
  markReplyPreviewDeleted,
  toReplyPreview,
} from "@/lib/message-helpers";
import type { Chat, ChatMessage, MessageSearchResult } from "@/types";

type UseMessageMutationsOptions = {
  userId: number;
  activeChat: Chat | undefined;
  messages: ChatMessage[];
  editingMessageText: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessageSearchResults: Dispatch<SetStateAction<MessageSearchResult[]>>;
  setActiveSearchResultId: Dispatch<SetStateAction<number | null>>;
  setReplyToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setEditingMessageSaving: Dispatch<SetStateAction<boolean>>;
  startEditingMessageDraft: (entry: ChatMessage) => void;
  cancelEditingMessage: () => void;
  clearEditStateForMessage: (chatId: number, messageId: number) => void;
  finishEditingMessage: (chatId: number, messageId: number) => void;
  closeMessageMenu: () => void;
  closeMessageStateForMessage: (messageId: number) => void;
  refreshChats: () => void;
  onSessionExpired: () => void;
  onError: (message: string) => void;
  onClearError: () => void;
};

type MessagePinState = Pick<
  ChatMessage,
  "pinned_at" | "pinned_by" | "is_pinned_for_me"
>;

export function useMessageMutations({
  userId,
  activeChat,
  messages,
  editingMessageText,
  setMessages,
  setMessageSearchResults,
  setActiveSearchResultId,
  setReplyToMessage,
  setChats,
  setEditingMessageSaving,
  startEditingMessageDraft,
  cancelEditingMessage,
  clearEditStateForMessage,
  finishEditingMessage,
  closeMessageMenu,
  closeMessageStateForMessage,
  refreshChats,
  onSessionExpired,
  onError,
  onClearError,
}: UseMessageMutationsOptions) {
  function applyMessageUpdate(updatedMessage: ChatMessage) {
    const nextMessage = {
      ...updatedMessage,
      isOwn: updatedMessage.sender_id === userId,
    };

    const updateMessage = (entry: ChatMessage) =>
      entry.id === updatedMessage.id &&
      entry.chat_id === updatedMessage.chat_id
        ? {
            ...entry,
            ...nextMessage,
            delivery_status: entry.delivery_status,
            temp_id: entry.temp_id,
          }
        : entry.reply_to?.id === updatedMessage.id &&
            entry.reply_to.message_type !== "deleted"
          ? {
              ...entry,
              reply_to: toReplyPreview(updatedMessage),
            }
          : entry;

    setMessages((current) => current.map(updateMessage));
    setMessageSearchResults((current) =>
      current.map((entry) =>
        entry.id === updatedMessage.id
          ? {
              ...entry,
              sender_id: updatedMessage.sender_id,
              sender_username: updatedMessage.sender_username,
              content: updatedMessage.content,
              created_at: updatedMessage.created_at ?? entry.created_at,
            }
          : entry,
      ),
    );
    setChats((current) =>
      current.map((chat) =>
        chat.id === updatedMessage.chat_id &&
        chat.last_message_id === updatedMessage.id
          ? {
              ...chat,
              last_message_text: getMessagePreviewText(updatedMessage),
              last_message_sender_id: updatedMessage.sender_id,
              last_message_created_at: updatedMessage.created_at,
              updated_at: updatedMessage.updated_at ?? chat.updated_at,
            }
          : chat,
      ),
    );
  }

  function updateMessagePinState(
    messageId: number,
    updates: Partial<MessagePinState>,
  ) {
    setMessages((current) =>
      current.map((entry) =>
        entry.id === messageId ? { ...entry, ...updates } : entry,
      ),
    );
  }

  async function pinMessage(entry: ChatMessage, scope: "me" | "chat") {
    if (entry.temp_id || entry.delivery_status === "sending") {
      return;
    }

    const previousPinState: MessagePinState = {
      pinned_at: entry.pinned_at,
      pinned_by: entry.pinned_by,
      is_pinned_for_me: entry.is_pinned_for_me,
    };

    updateMessagePinState(
      entry.id,
      scope === "me"
        ? { is_pinned_for_me: true }
        : {
            pinned_at: new Date().toISOString(),
            pinned_by: userId,
          },
    );

    try {
      await apiFetch<{ ok: boolean }>(`/messages/${entry.id}/pin`, {
        method: "POST",
        body: JSON.stringify({ scope }),
      });
      onClearError();
    } catch (error) {
      updateMessagePinState(entry.id, previousPinState);

      const message =
        error instanceof Error ? error.message : "Unable to pin message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    }
  }

  async function unpinMessage(entry: ChatMessage) {
    if (entry.temp_id || entry.delivery_status === "sending") {
      return;
    }

    const previousPinState: MessagePinState = {
      pinned_at: entry.pinned_at,
      pinned_by: entry.pinned_by,
      is_pinned_for_me: entry.is_pinned_for_me,
    };

    updateMessagePinState(entry.id, {
      pinned_at: null,
      pinned_by: null,
      is_pinned_for_me: false,
    });

    try {
      await apiFetch<{ ok: boolean }>(`/messages/${entry.id}/unpin`, {
        method: "DELETE",
      });
      onClearError();
    } catch (error) {
      updateMessagePinState(entry.id, previousPinState);

      const message =
        error instanceof Error ? error.message : "Unable to unpin message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    }
  }

  function removeMessagesLocally(messageIds: number[], chatId: number) {
    const messageIdSet = new Set(messageIds);

    setMessages((current) =>
      current
        .filter(
          (entry) => entry.chat_id !== chatId || !messageIdSet.has(entry.id),
        )
        .map((entry) =>
          messageIds.reduce(
            (updatedEntry, messageId) =>
              markReplyPreviewDeleted(updatedEntry, messageId),
            entry,
          ),
        ),
    );
    setMessageSearchResults((current) =>
      current.filter((entry) => !messageIdSet.has(entry.id)),
    );
    setActiveSearchResultId((current) =>
      current !== null && messageIdSet.has(current) ? null : current,
    );
    setReplyToMessage((current) =>
      current !== null && messageIdSet.has(current.id) ? null : current,
    );
    for (const messageId of messageIds) {
      closeMessageStateForMessage(messageId);
      clearEditStateForMessage(chatId, messageId);
    }
  }

  function removeMessageLocally(messageId: number, chatId: number) {
    removeMessagesLocally([messageId], chatId);
  }

  function startEditingMessage(entry: ChatMessage) {
    startEditingMessageDraft(entry);
    onClearError();
    closeMessageMenu();
  }

  async function saveMessageEdit(entry: ChatMessage) {
    const content = editingMessageText.trim();

    if (!content) {
      onError("Message cannot be empty.");
      return;
    }

    if (content === (entry.content ?? "")) {
      cancelEditingMessage();
      return;
    }

    setEditingMessageSaving(true);
    onClearError();

    try {
      const updatedMessage = await apiFetch<ChatMessage>(
        `/messages/${entry.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
        },
      );

      applyMessageUpdate(updatedMessage);
      finishEditingMessage(entry.chat_id, entry.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to edit message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    } finally {
      setEditingMessageSaving(false);
    }
  }

  async function deleteMessage(entry: ChatMessage, scope: "me" | "chat") {
    if (entry.temp_id || entry.delivery_status === "sending") {
      return;
    }

    const remainingVisibleMessages = getVisibleMessages(
      messages,
      entry.chat_id,
    ).filter((message) => message.id !== entry.id);
    const replacementLastMessage =
      remainingVisibleMessages[remainingVisibleMessages.length - 1] ?? null;

    try {
      await apiFetch<{ ok: boolean }>(`/messages/${entry.id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope }),
      });

      removeMessageLocally(entry.id, entry.chat_id);

      if (scope === "chat") {
        refreshChats();
      } else if (activeChat?.last_message_id === entry.id) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === entry.chat_id
              ? {
                  ...chat,
                  last_message_id: replacementLastMessage?.id ?? null,
                  last_message_text: replacementLastMessage?.content ?? null,
                  last_message_sender_id:
                    replacementLastMessage?.sender_id ?? null,
                  last_message_created_at:
                    replacementLastMessage?.created_at ?? null,
                }
              : chat,
          ),
        );
      }

      onClearError();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    }
  }

  return {
    applyMessageUpdate,
    removeMessageLocally,
    removeMessagesLocally,
    startEditingMessage,
    saveMessageEdit,
    pinMessage,
    unpinMessage,
    deleteMessage,
  };
}
