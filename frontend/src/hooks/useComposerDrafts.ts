import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { ChatMessage, ComposerDraft } from "@/types";

type UseComposerDraftsOptions = {
  activeChatId: number | null;
  hasDraftRecipient: boolean;
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  readComposerDraft: (chatId: number) => ComposerDraft;
  saveComposerDraft: (
    chatId: number,
    text: string,
    replyToMessageId: number | null,
  ) => void;
  clearStoredComposerDraft: (chatId: number) => void;
};

export function useComposerDrafts({
  activeChatId,
  hasDraftRecipient,
  message,
  setMessage,
  readComposerDraft,
  saveComposerDraft,
  clearStoredComposerDraft,
}: UseComposerDraftsOptions) {
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(
    null,
  );
  const pendingReplyToMessageIdByChatRef = useRef<
    Record<number, number | undefined>
  >({});

  const saveComposerDraftFromEffect = useEffectEvent(
    (
      chatId: number,
      text: string,
      replyToMessageId: number | null,
    ) => {
      saveComposerDraft(chatId, text, replyToMessageId);
    },
  );

  useEffect(() => {
    if (activeChatId === null || hasDraftRecipient) {
      return;
    }

    saveComposerDraftFromEffect(
      activeChatId,
      message,
      replyToMessage?.id ??
        pendingReplyToMessageIdByChatRef.current[activeChatId] ??
        null,
    );
  }, [activeChatId, hasDraftRecipient, message, replyToMessage?.id]);

  function clearComposerDraft(chatId: number) {
    delete pendingReplyToMessageIdByChatRef.current[chatId];
    clearStoredComposerDraft(chatId);
  }

  function restoreComposerDraft(
    chatId: number,
    availableMessages: ChatMessage[],
    messagesLoaded = false,
  ) {
    const draft = readComposerDraft(chatId);
    const replyToMessageId = draft.reply_to_message_id;

    setMessage(draft.text);

    if (replyToMessageId === null) {
      delete pendingReplyToMessageIdByChatRef.current[chatId];
      setReplyToMessage(null);
      return;
    }

    const replyMessage =
      availableMessages.find((entry) => entry.id === replyToMessageId) ??
      null;

    if (replyMessage) {
      delete pendingReplyToMessageIdByChatRef.current[chatId];
      setReplyToMessage(replyMessage);
      return;
    }

    if (messagesLoaded) {
      delete pendingReplyToMessageIdByChatRef.current[chatId];
      setReplyToMessage(null);
      return;
    }

    pendingReplyToMessageIdByChatRef.current[chatId] = replyToMessageId;
    setReplyToMessage(
      availableMessages.find((entry) => entry.id === replyToMessageId) ??
        null,
    );
  }

  return {
    replyToMessage,
    setReplyToMessage,
    clearComposerDraft,
    restoreComposerDraft,
  };
}
