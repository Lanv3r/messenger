import {
  useEffect,
  useEffectEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { apiFetch } from "@/lib/api";
import { sortChats } from "@/lib/chat-helpers";
import type { Chat, ChatMessage } from "@/types";

type UseChatDataOptions = {
  userId: number;
  activeChatId: number | null;
  activeChatIdRef: MutableRefObject<number | null>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesLoading: Dispatch<SetStateAction<boolean>>;
  setActiveChatId: Dispatch<SetStateAction<number | null>>;
  applyLocalReadState: (chat: Chat) => Chat;
  restoreComposerDraft: (
    chatId: number,
    availableMessages: ChatMessage[],
    messagesLoaded?: boolean,
  ) => void;
  restoreEditDraft: (chatId: number, availableMessages: ChatMessage[]) => void;
  onSessionExpired: () => void;
  onError: (message: string | null) => void;
};

export function useChatData({
  userId,
  activeChatId,
  activeChatIdRef,
  setChats,
  setMessages,
  setMessagesLoading,
  setActiveChatId,
  applyLocalReadState,
  restoreComposerDraft,
  restoreEditDraft,
  onSessionExpired,
  onError,
}: UseChatDataOptions) {
  function setLoadedChats(loadedChats: Chat[]) {
    setChats(sortChats(loadedChats.map(applyLocalReadState)));
  }

  async function refreshChats(fallbackMessage = "Unable to load chats.") {
    try {
      const loadedChats = await apiFetch<Chat[]>("/chats");
      setLoadedChats(loadedChats);
      onError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : fallbackMessage;

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    }
  }

  const initializeChatsFromEffect = useEffectEvent(async () => {
    // A session always begins without an active conversation.
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setMessages([]);
    setMessagesLoading(false);

    try {
      const loadedChats = await apiFetch<Chat[]>("/chats");

      setLoadedChats(loadedChats);
      onError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load chats.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    }
  });

  const restoreLoadedMessagesFromEffect = useEffectEvent(
    (chatId: number, chatMessages: ChatMessage[]) => {
      restoreComposerDraft(chatId, chatMessages, true);
      restoreEditDraft(chatId, chatMessages);
    },
  );

  useEffect(() => {
    void initializeChatsFromEffect();
  }, [userId]);

  useEffect(() => {
    if (activeChatId === null) {
      return;
    }

    const chatId = activeChatId;
    const controller = new AbortController();
    setMessagesLoading(true);

    async function loadMessages() {
      try {
        const chatMessages = await apiFetch<ChatMessage[]>(
          `/chats/${chatId}/messages`,
          {
            signal: controller.signal,
          },
        );

        setMessages(chatMessages);
        restoreLoadedMessagesFromEffect(chatId, chatMessages);
        setMessagesLoading(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
        if (!controller.signal.aborted) {
          setMessagesLoading(false);
        }
      }
    }

    void loadMessages();

    return () => {
      controller.abort();
    };
  }, [activeChatId, setMessages, setMessagesLoading]);

  return { refreshChats };
}
