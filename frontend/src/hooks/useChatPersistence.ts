import { readNumberFromSessionStorage } from "@/lib/message-helpers";
import type { ComposerDraft } from "@/types";

export function useChatPersistence(userId: number) {
  function getChatSessionStorageKey(key: string) {
    return `messenger:${userId}:${key}`;
  }

  function getChatScrollSessionStorageKey(chatId: number) {
    return getChatSessionStorageKey(`chat:${chatId}:scrollTop`);
  }

  function getMessageDraftSessionStorageKey(chatId: number) {
    return getChatSessionStorageKey(`chat:${chatId}:messageDraft`);
  }

  function getActiveEditDraftSessionStorageKey(chatId: number) {
    return getChatSessionStorageKey(`chat:${chatId}:activeEditMessageId`);
  }

  function getEditDraftSessionStorageKey(chatId: number, messageId: number) {
    return getChatSessionStorageKey(`chat:${chatId}:edit:${messageId}`);
  }

  function saveActiveChatId(chatId: number) {
    window.sessionStorage.setItem(
      getChatSessionStorageKey("activeChatId"),
      String(chatId),
    );
  }

  function getSavedActiveChatId() {
    return readNumberFromSessionStorage(
      getChatSessionStorageKey("activeChatId"),
    );
  }

  function clearSavedActiveChat() {
    window.sessionStorage.removeItem(getChatSessionStorageKey("activeChatId"));
  }

  function saveChatScrollPosition(chatId: number, scrollTop: number) {
    window.sessionStorage.setItem(
      getChatScrollSessionStorageKey(chatId),
      String(Math.max(0, Math.round(scrollTop))),
    );
  }

  function getSavedChatScrollPosition(chatId: number) {
    return readNumberFromSessionStorage(getChatScrollSessionStorageKey(chatId));
  }

  function readComposerDraft(chatId: number): ComposerDraft {
    const value = window.sessionStorage.getItem(
      getMessageDraftSessionStorageKey(chatId),
    );

    if (value === null) {
      return { text: "", reply_to_message_id: null };
    }

    try {
      const draft = JSON.parse(value) as Partial<ComposerDraft>;
      return {
        text: typeof draft.text === "string" ? draft.text : "",
        reply_to_message_id:
          typeof draft.reply_to_message_id === "number"
            ? draft.reply_to_message_id
            : null,
      };
    } catch {
      return { text: value, reply_to_message_id: null };
    }
  }

  function saveComposerDraft(
    chatId: number,
    text: string,
    replyToMessageId: number | null,
  ) {
    const key = getMessageDraftSessionStorageKey(chatId);

    if (!text && replyToMessageId === null) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        text,
        reply_to_message_id: replyToMessageId,
      } satisfies ComposerDraft),
    );
  }

  function clearComposerDraft(chatId: number) {
    window.sessionStorage.removeItem(getMessageDraftSessionStorageKey(chatId));
  }

  function saveActiveEditDraft(chatId: number, messageId: number) {
    window.sessionStorage.setItem(
      getActiveEditDraftSessionStorageKey(chatId),
      String(messageId),
    );
  }

  function clearActiveEditDraft(chatId: number) {
    window.sessionStorage.removeItem(
      getActiveEditDraftSessionStorageKey(chatId),
    );
  }

  function readActiveEditDraft(chatId: number) {
    return readNumberFromSessionStorage(
      getActiveEditDraftSessionStorageKey(chatId),
    );
  }

  function saveEditDraft(chatId: number, messageId: number, text: string) {
    window.sessionStorage.setItem(
      getEditDraftSessionStorageKey(chatId, messageId),
      text,
    );
  }

  function readEditDraft(chatId: number, messageId: number) {
    return window.sessionStorage.getItem(
      getEditDraftSessionStorageKey(chatId, messageId),
    );
  }

  function clearEditDraft(chatId: number, messageId: number) {
    window.sessionStorage.removeItem(
      getEditDraftSessionStorageKey(chatId, messageId),
    );
  }

  return {
    saveActiveChatId,
    getSavedActiveChatId,
    clearSavedActiveChat,
    saveChatScrollPosition,
    getSavedChatScrollPosition,
    readComposerDraft,
    saveComposerDraft,
    clearComposerDraft,
    saveActiveEditDraft,
    clearActiveEditDraft,
    readActiveEditDraft,
    saveEditDraft,
    readEditDraft,
    clearEditDraft,
  };
}
