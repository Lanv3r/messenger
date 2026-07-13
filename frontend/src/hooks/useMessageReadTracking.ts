import {
  useEffect,
  useEffectEvent,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { apiFetch } from "@/lib/api";
import { getVisibleMessages } from "@/lib/chat-helpers";
import type { Chat, ChatMessage } from "@/types";

type MarkReadOptions = {
  resetUnread?: boolean;
  unreadCountChange?: number;
};

type PendingMessageScroll = {
  chatId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
  scrollTop?: number | null;
};

type UseMessageReadTrackingOptions = {
  messagesRef: RefObject<HTMLUListElement | null>;
  activeChatId: number | null;
  activeChat: Chat | undefined;
  messages: ChatMessage[];
  currentUserId: number;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  saveChatScrollPosition: (chatId: number, scrollTop: number) => void;
  onSessionExpired: () => void;
  onError: (message: string) => void;
};

export function useMessageReadTracking({
  messagesRef,
  activeChatId,
  activeChat,
  messages,
  currentUserId,
  setChats,
  saveChatScrollPosition,
  onSessionExpired,
  onError,
}: UseMessageReadTrackingOptions) {
  const pendingMessageScrollRef = useRef<PendingMessageScroll | null>(null);
  const readCoverageByChatRef = useRef<
    Record<number, { top: number; bottom: number }>
  >({});
  const lastReadMessageIdByChatRef = useRef<Record<number, number>>({});
  const unreadCountOverrideByChatRef = useRef<Record<number, number>>({});
  const isNearBottomByChatRef = useRef<Record<number, boolean>>({});

  function applyLocalReadState(chat: Chat) {
    const localLastReadMessageId =
      lastReadMessageIdByChatRef.current[chat.id];
    const unreadCountOverride =
      unreadCountOverrideByChatRef.current[chat.id];

    if (
      localLastReadMessageId === undefined ||
      localLastReadMessageId <= (chat.current_last_read_message_id ?? 0)
    ) {
      if (unreadCountOverride === undefined) {
        return chat;
      }

      const chatHasNewerUnreadMessages =
        localLastReadMessageId !== undefined &&
        chat.last_message_id !== null &&
        chat.last_message_id > localLastReadMessageId &&
        chat.unread_count > unreadCountOverride;

      return {
        ...chat,
        unread_count: chatHasNewerUnreadMessages
          ? chat.unread_count
          : unreadCountOverride,
      };
    }

    return {
      ...chat,
      current_last_read_message_id: localLastReadMessageId,
      unread_count:
        unreadCountOverride ??
        (chat.last_message_id !== null &&
        localLastReadMessageId >= chat.last_message_id
          ? 0
          : chat.unread_count),
    };
  }

  function markChatReadThrough(
    chatId: number,
    messageId: number,
    options: MarkReadOptions = {},
  ) {
    const previousLastReadMessageId =
      lastReadMessageIdByChatRef.current[chatId] ?? 0;
    const nextLastReadMessageId = Math.max(
      previousLastReadMessageId,
      messageId,
    );

    lastReadMessageIdByChatRef.current[chatId] = nextLastReadMessageId;

    if (options.resetUnread) {
      unreadCountOverrideByChatRef.current[chatId] = 0;
    }

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== chatId) {
          return chat;
        }

        const nextUnreadCount = options.resetUnread
          ? 0
          : Math.max(
              0,
              chat.unread_count - (options.unreadCountChange ?? 0),
            );

        unreadCountOverrideByChatRef.current[chatId] = nextUnreadCount;

        return {
          ...chat,
          current_last_read_message_id: Math.max(
            chat.current_last_read_message_id ?? 0,
            nextLastReadMessageId,
          ),
          unread_count: nextUnreadCount,
        };
      }),
    );

    if (messageId <= previousLastReadMessageId) {
      return;
    }

    apiFetch<{ ok: boolean }>(`/chats/${chatId}/read`, {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        last_read_message_id: messageId,
      }),
    }).catch((error) => {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
        return;
      }

      const message =
        error instanceof Error ? error.message : "Unable to mark chat read.";
      onError(message);
    });
  }

  const markChatReadThroughFromEffect = useEffectEvent(
    (chatId: number, messageId: number, options: MarkReadOptions = {}) => {
      markChatReadThrough(chatId, messageId, options);
    },
  );

  const saveChatScrollPositionFromEffect = useEffectEvent(
    (chatId: number, scrollTop: number) => {
      saveChatScrollPosition(chatId, scrollTop);
    },
  );

  const getVisibleMessagesFromEffect = useEffectEvent((chatId: number) =>
    getVisibleMessages(messages, chatId),
  );

  function prepareMessageScroll(scroll: PendingMessageScroll) {
    pendingMessageScrollRef.current = scroll;
  }

  function clearChatReadState(chatId: number) {
    delete lastReadMessageIdByChatRef.current[chatId];
    delete unreadCountOverrideByChatRef.current[chatId];
    delete readCoverageByChatRef.current[chatId];
    delete isNearBottomByChatRef.current[chatId];
  }

  useEffect(() => {
    const messagesElement = messagesRef.current;

    if (!messagesElement || activeChatId === null || !activeChat) {
      return;
    }

    const serverLastReadMessageId =
      activeChat.current_last_read_message_id ?? 0;
    const localLastReadMessageId =
      lastReadMessageIdByChatRef.current[activeChatId] ?? 0;
    lastReadMessageIdByChatRef.current[activeChatId] = Math.max(
      serverLastReadMessageId,
      localLastReadMessageId,
    );

    const activeMessages = getVisibleMessagesFromEffect(activeChatId);

    const getCurrentLastReadMessageId = () =>
      Math.max(
        activeChat.current_last_read_message_id ?? 0,
        lastReadMessageIdByChatRef.current[activeChatId] ?? 0,
      );

    const getUnreadIncomingMessages = () =>
      activeMessages.filter(
        (entry) =>
          entry.sender_id !== currentUserId &&
          entry.delivery_status !== "sending" &&
          entry.delivery_status !== "failed" &&
          entry.id > getCurrentLastReadMessageId(),
      );

    const getMessageBounds = (messageId: number) => {
      const target = messagesElement.querySelector(
        `[data-message-id="${messageId}"]`,
      );

      if (!(target instanceof HTMLElement)) {
        return null;
      }

      const containerRect = messagesElement.getBoundingClientRect();
      const messageRect = target.getBoundingClientRect();
      const top =
        messageRect.top - containerRect.top + messagesElement.scrollTop;

      return {
        top,
        bottom: top + messageRect.height,
      };
    };

    const markCoveredMessagesRead = (coverage: {
      top: number;
      bottom: number;
    }) => {
      const currentLastReadMessageId = getCurrentLastReadMessageId();
      const unreadIncomingMessages = getUnreadIncomingMessages();
      let nextLastReadMessageId = currentLastReadMessageId;

      for (const entry of unreadIncomingMessages) {
        const messageBounds = getMessageBounds(entry.id);

        if (!messageBounds) {
          break;
        }

        const messageWasCovered =
          messageBounds.top >= coverage.top - 2 &&
          messageBounds.bottom <= coverage.bottom + 2;

        if (!messageWasCovered) {
          break;
        }

        nextLastReadMessageId = entry.id;
      }

      if (nextLastReadMessageId <= currentLastReadMessageId) {
        return;
      }

      const newlyReadCount = unreadIncomingMessages.filter(
        (entry) => entry.id <= nextLastReadMessageId,
      ).length;

      markChatReadThroughFromEffect(activeChatId, nextLastReadMessageId, {
        unreadCountChange: newlyReadCount,
      });
    };

    const updateReadCoverage = () => {
      const viewportTop = messagesElement.scrollTop;
      const viewportBottom =
        messagesElement.scrollTop + messagesElement.clientHeight;
      const previousCoverage = readCoverageByChatRef.current[activeChatId];
      const nextCoverage = previousCoverage
        ? {
            top: Math.min(previousCoverage.top, viewportTop),
            bottom: Math.max(previousCoverage.bottom, viewportBottom),
          }
        : {
            top: viewportTop,
            bottom: viewportBottom,
          };

      readCoverageByChatRef.current[activeChatId] = nextCoverage;
      markCoveredMessagesRead(nextCoverage);
    };

    let animationFrameId = requestAnimationFrame(updateReadCoverage);

    const updateNearBottom = () => {
      const distanceFromBottom =
        messagesElement.scrollHeight -
        messagesElement.scrollTop -
        messagesElement.clientHeight;

      isNearBottomByChatRef.current[activeChatId] = distanceFromBottom <= 80;
    };

    const handleScroll = () => {
      updateNearBottom();
      saveChatScrollPositionFromEffect(activeChatId, messagesElement.scrollTop);
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateReadCoverage);
    };

    messagesElement.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
      messagesElement.removeEventListener("scroll", handleScroll);
    };
  }, [activeChat, activeChatId, currentUserId, messagesRef, messages]);

  useEffect(() => {
    const messagesElement = messagesRef.current;

    if (!messagesElement || activeChatId === null) {
      return;
    }

    const activeMessages = getVisibleMessagesFromEffect(activeChatId);

    if (activeMessages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      const pendingScroll = pendingMessageScrollRef.current;
      const scrollToBottom = () => {
        messagesElement.scrollTop = messagesElement.scrollHeight;
        isNearBottomByChatRef.current[activeChatId] = true;
        requestAnimationFrame(() => {
          messagesElement.dispatchEvent(new Event("scroll"));
        });
      };

      if (!pendingScroll || pendingScroll.chatId !== activeChatId) {
        if (isNearBottomByChatRef.current[activeChatId]) {
          scrollToBottom();
        }
        return;
      }

      if (
        pendingScroll.scrollTop !== null &&
        pendingScroll.scrollTop !== undefined
      ) {
        const maxScrollTop =
          messagesElement.scrollHeight - messagesElement.clientHeight;
        messagesElement.scrollTop = Math.min(
          pendingScroll.scrollTop,
          Math.max(0, maxScrollTop),
        );
        pendingMessageScrollRef.current = null;
        requestAnimationFrame(() => {
          messagesElement.dispatchEvent(new Event("scroll"));
        });
        return;
      }

      if (pendingScroll.unreadCount > 0) {
        const firstUnreadMessage = activeMessages.find(
          (entry) =>
            entry.sender_id !== currentUserId &&
            entry.delivery_status !== "sending" &&
            entry.delivery_status !== "failed" &&
            (pendingScroll.lastReadMessageId === null ||
              entry.id > pendingScroll.lastReadMessageId),
        );

        if (firstUnreadMessage) {
          const target = messagesElement.querySelector(
            `[data-message-id="${firstUnreadMessage.id}"]`,
          );

          if (target instanceof HTMLElement) {
            target.scrollIntoView({ block: "center" });
            pendingMessageScrollRef.current = null;
            requestAnimationFrame(() => {
              messagesElement.dispatchEvent(new Event("scroll"));
            });
            return;
          }
        }
      }

      pendingMessageScrollRef.current = null;
      scrollToBottom();
    });
  }, [activeChatId, currentUserId, messages.length, messagesRef]);

  return {
    applyLocalReadState,
    markChatReadThrough,
    prepareMessageScroll,
    clearChatReadState,
  };
}
