import {
  useEffect,
  useEffectEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Socket } from "socket.io-client";

import { apiFetch } from "@/lib/api";
import { sortChats } from "@/lib/chat-helpers";
import type { Chat, ChatMessage } from "@/types";

type PrepareMessageScrollOptions = {
  chatId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
  scrollTop?: number | null;
};

type UseChatDataOptions = {
  userId: number;
  activeChatId: number | null;
  activeChatIdRef: MutableRefObject<number | null>;
  socketRef: MutableRefObject<Socket | null>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setActiveChatId: Dispatch<SetStateAction<number | null>>;
  applyLocalReadState: (chat: Chat) => Chat;
  prepareMessageScroll: (options: PrepareMessageScrollOptions) => void;
  getSavedActiveChatId: () => number | null;
  getSavedChatScrollPosition: (chatId: number) => number | null;
  saveActiveChatId: (chatId: number) => void;
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
  socketRef,
  setChats,
  setMessages,
  setActiveChatId,
  applyLocalReadState,
  prepareMessageScroll,
  getSavedActiveChatId,
  getSavedChatScrollPosition,
  saveActiveChatId,
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
    try {
      const loadedChats = await apiFetch<Chat[]>("/chats");

      setLoadedChats(loadedChats);
      onError(null);

      if (loadedChats.length > 0) {
        const savedActiveChatId = getSavedActiveChatId();
        const restoredChat =
          savedActiveChatId === null
            ? null
            : loadedChats.find((chat) => chat.id === savedActiveChatId);
        const selectedChat =
          restoredChat ??
          loadedChats.find((chat) => chat.type === "self") ??
          loadedChats[0];

        prepareMessageScroll({
          chatId: selectedChat.id,
          lastReadMessageId: selectedChat.current_last_read_message_id,
          unreadCount: selectedChat.unread_count,
          scrollTop:
            restoredChat === null
              ? null
              : getSavedChatScrollPosition(selectedChat.id),
        });
        activeChatIdRef.current = selectedChat.id;
        saveActiveChatId(selectedChat.id);
        socketRef.current?.emit("join_room", String(selectedChat.id));
        setActiveChatId(selectedChat.id);
        restoreComposerDraft(selectedChat.id, []);
      }
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
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      }
    }

    void loadMessages();

    return () => {
      controller.abort();
    };
  }, [activeChatId, setMessages]);

  return { refreshChats };
}
