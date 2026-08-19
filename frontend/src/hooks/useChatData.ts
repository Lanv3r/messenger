import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
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
  activeChat: Chat | undefined;
  messages: ChatMessage[];
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

const MESSAGE_PAGE_SIZE = 50;

export function useChatData({
  userId,
  activeChatId,
  activeChatIdRef,
  activeChat,
  messages,
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
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const olderMessagesLoadingRef = useRef(false);
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;

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
    setHasOlderMessages(false);

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
    olderMessagesLoadingRef.current = false;
    setHasOlderMessages(false);
    setOlderMessagesLoading(false);
    setMessagesLoading(true);

    async function loadMessages() {
      try {
        let chatMessages = await apiFetch<ChatMessage[]>(
          `/chats/${chatId}/messages?limit=${MESSAGE_PAGE_SIZE}`,
          {
            signal: controller.signal,
          },
        );
        let pageHasOlderMessages = chatMessages.length === MESSAGE_PAGE_SIZE;
        const chat = activeChatRef.current;
        const unreadCount = chat?.id === chatId ? chat.unread_count : 0;
        const lastReadMessageId =
          chat?.id === chatId ? chat.current_last_read_message_id : null;
        const loadedUnreadCount = () =>
          chatMessages.filter(
            (entry) =>
              entry.sender_id !== userId &&
              (lastReadMessageId === null || entry.id > lastReadMessageId),
          ).length;

        while (
          pageHasOlderMessages &&
          loadedUnreadCount() < unreadCount &&
          chatMessages.length > 0
        ) {
          const olderMessages = await apiFetch<ChatMessage[]>(
            `/chats/${chatId}/messages?limit=${MESSAGE_PAGE_SIZE}&before_id=${chatMessages[0].id}`,
            {
              signal: controller.signal,
            },
          );
          chatMessages = [...olderMessages, ...chatMessages];
          pageHasOlderMessages = olderMessages.length === MESSAGE_PAGE_SIZE;
        }

        setMessages(chatMessages);
        setHasOlderMessages(pageHasOlderMessages);
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
  }, [activeChatId, setMessages, setMessagesLoading, userId]);

  async function loadOlderMessages() {
    if (
      activeChatId === null ||
      !hasOlderMessages ||
      olderMessagesLoadingRef.current
    ) {
      return false;
    }

    const chatId = activeChatId;
    const oldestMessage = messages.find(
      (entry) => entry.chat_id === chatId && entry.temp_id === undefined,
    );
    if (!oldestMessage) {
      setHasOlderMessages(false);
      return false;
    }

    olderMessagesLoadingRef.current = true;
    setOlderMessagesLoading(true);

    try {
      const olderMessages = await apiFetch<ChatMessage[]>(
        `/chats/${chatId}/messages?limit=${MESSAGE_PAGE_SIZE}&before_id=${oldestMessage.id}`,
      );

      if (activeChatIdRef.current !== chatId) {
        return false;
      }

      setMessages((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        const newOlderMessages = olderMessages.filter(
          (entry) => !existingIds.has(entry.id),
        );
        return [...newOlderMessages, ...current];
      });
      setHasOlderMessages(olderMessages.length === MESSAGE_PAGE_SIZE);
      return olderMessages.length > 0;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
        return false;
      }

      const message =
        error instanceof Error ? error.message : "Unable to load older messages.";
      onError(message);
      return false;
    } finally {
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    }
  }

  async function loadMessagesThrough(messageId: number) {
    if (messages.some((entry) => entry.id === messageId)) {
      return true;
    }
    if (activeChatId === null || olderMessagesLoadingRef.current) {
      return false;
    }

    const chatId = activeChatId;
    const oldestMessage = messages.find(
      (entry) => entry.chat_id === chatId && entry.temp_id === undefined,
    );
    if (!oldestMessage || messageId >= oldestMessage.id) {
      return false;
    }

    olderMessagesLoadingRef.current = true;
    setOlderMessagesLoading(true);

    try {
      let cursor = oldestMessage.id;
      let pageHasOlderMessages = hasOlderMessages;
      let foundMessage = false;
      let collectedMessages: ChatMessage[] = [];

      while (pageHasOlderMessages && cursor > messageId) {
        const page = await apiFetch<ChatMessage[]>(
          `/chats/${chatId}/messages?limit=${MESSAGE_PAGE_SIZE}&before_id=${cursor}`,
        );
        if (activeChatIdRef.current !== chatId || page.length === 0) {
          pageHasOlderMessages = false;
          break;
        }

        collectedMessages = [...page, ...collectedMessages];
        foundMessage ||= page.some((entry) => entry.id === messageId);
        cursor = page[0].id;
        pageHasOlderMessages = page.length === MESSAGE_PAGE_SIZE;
        if (foundMessage) {
          break;
        }
      }

      if (activeChatIdRef.current !== chatId) {
        return false;
      }

      if (collectedMessages.length > 0) {
        setMessages((current) => {
          const existingIds = new Set(current.map((entry) => entry.id));
          const newMessages = collectedMessages.filter(
            (entry) => !existingIds.has(entry.id),
          );
          return [...newMessages, ...current];
        });
      }
      setHasOlderMessages(pageHasOlderMessages);
      return foundMessage;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
        return false;
      }

      const message =
        error instanceof Error ? error.message : "Unable to load message history.";
      onError(message);
      return false;
    } finally {
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    }
  }

  return {
    refreshChats,
    hasOlderMessages,
    olderMessagesLoading,
    loadOlderMessages,
    loadMessagesThrough,
  };
}
