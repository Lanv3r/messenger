import { useCallback, useEffect, useEffectEvent, useState } from "react";

import type { ChatMessage } from "@/types";

type UseMessageEditingOptions = {
  activeChatId: number | null;
  currentUserId: number;
  readActiveEditDraft: (chatId: number) => number | null;
  saveActiveEditDraft: (chatId: number, messageId: number) => void;
  clearActiveEditDraft: (chatId: number) => void;
  readEditDraft: (chatId: number, messageId: number) => string | null;
  saveEditDraft: (chatId: number, messageId: number, text: string) => void;
  clearEditDraft: (chatId: number, messageId: number) => void;
};

export function useMessageEditing({
  activeChatId,
  currentUserId,
  readActiveEditDraft,
  saveActiveEditDraft,
  clearActiveEditDraft,
  readEditDraft,
  saveEditDraft,
  clearEditDraft,
}: UseMessageEditingOptions) {
  const [editingMessageId, setEditingMessageId] = useState<number | null>(
    null,
  );
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessageSaving, setEditingMessageSaving] = useState(false);

  const saveEditDraftsFromEffect = useEffectEvent(
    (chatId: number, messageId: number, text: string) => {
      saveActiveEditDraft(chatId, messageId);
      saveEditDraft(chatId, messageId, text);
    },
  );

  useEffect(() => {
    if (activeChatId === null || editingMessageId === null) {
      return;
    }

    saveEditDraftsFromEffect(activeChatId, editingMessageId, editingMessageText);
  }, [activeChatId, editingMessageId, editingMessageText]);

  const resetEditingState = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessageSaving(false);
  }, []);

  const restoreEditDraft = (
    chatId: number,
    availableMessages: ChatMessage[],
  ) => {
    const messageId = readActiveEditDraft(chatId);
    if (messageId === null) {
      setEditingMessageId(null);
      setEditingMessageText("");
      return;
    }

    const editedMessage = availableMessages.find(
      (entry) => entry.id === messageId,
    );
    if (
      editedMessage === undefined ||
      editedMessage.sender_id !== currentUserId ||
      editedMessage.content === null ||
      editedMessage.message_type !== "text"
    ) {
      clearActiveEditDraft(chatId);
      clearEditDraft(chatId, messageId);
      setEditingMessageId(null);
      setEditingMessageText("");
      return;
    }

    setEditingMessageId(messageId);
    setEditingMessageText(
      readEditDraft(chatId, messageId) ?? editedMessage.content,
    );
  };

  const startEditingMessage = (entry: ChatMessage) => {
    setEditingMessageId(entry.id);
    setEditingMessageText(
      readEditDraft(entry.chat_id, entry.id) ?? entry.content ?? "",
    );
    saveActiveEditDraft(entry.chat_id, entry.id);
  };

  const cancelEditingMessage = () => {
    if (activeChatId !== null && editingMessageId !== null) {
      clearEditDraft(activeChatId, editingMessageId);
      clearActiveEditDraft(activeChatId);
    }

    resetEditingState();
  };

  const clearEditStateForMessage = (chatId: number, messageId: number) => {
    setEditingMessageId((current) =>
      current === messageId ? null : current,
    );
    clearEditDraft(chatId, messageId);
    if (readActiveEditDraft(chatId) === messageId) {
      clearActiveEditDraft(chatId);
    }
  };

  const finishEditingMessage = (chatId: number, messageId: number) => {
    clearEditDraft(chatId, messageId);
    clearActiveEditDraft(chatId);
    resetEditingState();
  };

  return {
    editingMessageId,
    editingMessageText,
    editingMessageSaving,
    setEditingMessageText,
    setEditingMessageSaving,
    resetEditingState,
    restoreEditDraft,
    startEditingMessage,
    cancelEditingMessage,
    clearEditStateForMessage,
    finishEditingMessage,
  };
}
