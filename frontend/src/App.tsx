import { Fragment, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, ClockArrowUp, Pin } from "lucide-react";
import { io, Socket } from "socket.io-client";

import { API_URL, apiFetch } from "@/lib/api";
import Login from "@/Login";
import Signup from "@/Signup";
import { Button } from "@/components/ui/button";
import "./App.css";

type ChatMessage = {
  id: number;
  chat_id: number;
  sender_id: number | null;
  sender_username: string | null;
  sender_avatar_url?: string | null;
  content: string | null;
  message_type: string;
  reply_to_message_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  is_pinned: boolean;
  metadata?: Record<string, unknown>;
  isOwn?: boolean;
  delivery_status?: "sending" | "sent" | "read" | "failed";
  temp_id?: string;
};

type AuthUser = {
  userId: number;
  username: string;
  firstName: string;
  lastName: string | null;
  bio: string | null;
  avatarUrl: string;
  status: string;
};

type AuthResponse = {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  bio?: string | null;
  avatar_url?: string;
  status?: string;
};

type UserProfile = AuthResponse & {
  bio: string | null;
  avatar_url: string;
  status: string;
};

type Chat = {
  id: number;
  type: "self" | "direct" | "group" | string;
  title: string | null;
  description: string | null;
  avatar_url: string;
  display_title: string;
  display_avatar_url: string;
  other_user_id: number | null;
  last_message_id: number | null;
  last_message_text: string | null;
  last_message_sender_id: number | null;
  last_message_created_at: string | null;
  unread_count: number;
  is_pinned: boolean;
  current_last_read_message_id: number | null;
  other_last_read_message_id: number | null;
  other_last_read_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type DirectMessageResponse = {
  chat: Chat;
  message: ChatMessage;
};

type MessageAck = {
  ok: boolean;
  message?: ChatMessage;
  error?: string;
};

type ChatReadEvent = {
  chat_id: number;
  user_id: number;
  last_read_message_id: number;
  last_read_at: string | null;
};

type ChatUpdatedEvent = {
  chat_id: number;
  last_message: ChatMessage;
};

type ChatSettingsResponse = {
  ok: boolean;
  chat_id: number;
  is_pinned: boolean;
  is_archived?: boolean;
  muted_until?: string | null;
};

function getChatSortTime(chat: Chat) {
  const value = chat.last_message_created_at ?? chat.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortChats(chats: Chat[]) {
  return [...chats].sort((first, second) => {
    const firstIsPinned = Boolean(first.is_pinned);
    const secondIsPinned = Boolean(second.is_pinned);

    if (firstIsPinned !== secondIsPinned) {
      return firstIsPinned ? -1 : 1;
    }

    return getChatSortTime(second) - getChatSortTime(first);
  });
}

function applyLastMessagePreview(
  chat: Chat,
  message: ChatMessage,
): Chat {
  return {
    ...chat,
    last_message_id: message.id,
    last_message_text: message.content,
    last_message_sender_id: message.sender_id,
    last_message_created_at: message.created_at,
    updated_at: message.updated_at ?? chat.updated_at,
  };
}

function upsertChatPreview(
  chats: Chat[],
  chat: Chat,
  message: ChatMessage,
) {
  const nextChat = applyLastMessagePreview(chat, message);
  const existingIndex = chats.findIndex(
    (item) => item.id === chat.id,
  );

  if (existingIndex === -1) {
    return sortChats([nextChat, ...chats]);
  }

  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1);
  return sortChats([nextChat, ...nextChats]);
}

function updateChatPreview(
  chats: Chat[],
  message: ChatMessage,
) {
  const existingChat = chats.find(
    (chat) => chat.id === message.chat_id,
  );

  if (!existingChat) {
    return chats;
  }

  return upsertChatPreview(chats, existingChat, message);
}

function replaceTemporaryMessage(
  messages: ChatMessage[],
  tempId: string,
  nextMessage: ChatMessage,
) {
  return messages.map((message) =>
    message.temp_id === tempId ? nextMessage : message,
  );
}

function getMessageTime(message: ChatMessage) {
  if (!message.created_at) {
    return 0;
  }

  const timestamp = new Date(message.created_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareMessages(first: ChatMessage, second: ChatMessage) {
  const timeDifference =
    getMessageTime(first) - getMessageTime(second);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return first.id - second.id;
}

function getVisibleMessages(
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSearchExcerpt(content: string | null, query: string) {
  if (!content) {
    return "No message text";
  }

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return content;
  }

  const matchIndex = content.toLowerCase().indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return content;
  }

  const contextLength = 42;
  const matchEnd = matchIndex + normalizedQuery.length;
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(content.length, matchEnd + contextLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";

  return `${prefix}${content.slice(start, end)}${suffix}`;
}

function highlightSearchText(content: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return content;
  }

  const parts = content.split(
    new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi"),
  );

  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery ? (
      <mark className="message-search-match" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

function readNumberFromSessionStorage(key: string) {
  const value = window.sessionStorage.getItem(key);

  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function toAuthUser(authUser: AuthResponse): AuthUser {
  return {
    userId: authUser.id,
    username: authUser.username,
    firstName: authUser.first_name,
    lastName: authUser.last_name,
    bio: authUser.bio ?? null,
    avatarUrl: authUser.avatar_url ?? "/favicon.svg",
    status: authUser.status ?? "online",
  };
}

function ChatScreen({
  user,
  onSignOut,
  onSessionExpired,
  onUserUpdated,
}: {
  user: AuthUser;
  onSignOut: () => void;
  onSessionExpired: () => void;
  onUserUpdated: (user: AuthResponse) => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<
    number | null
  >(null);
  const activeChatIdRef = useRef<number | null>(null);
  const [draftRecipient, setDraftRecipient] = useState<UserProfile | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting...");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(
    null,
  );
  const [profileQuery, setProfileQuery] = useState("");
  const [profileResult, setProfileResult] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState(user.firstName);
  const [profileLastName, setProfileLastName] = useState(user.lastName ?? "");
  const [profileBio, setProfileBio] = useState(user.bio ?? "");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(user.avatarUrl);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(
    null,
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<
    ChatMessage[]
  >([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState<string | null>(
    null,
  );
  const [messageSearchHasSearched, setMessageSearchHasSearched] =
    useState(false);
  const [activeSearchResultId, setActiveSearchResultId] = useState<
    number | null
  >(null);
  const messagesRef = useRef<HTMLUListElement | null>(null);
  const pendingMessageScrollRef = useRef<{
    chatId: number;
    lastReadMessageId: number | null;
    unreadCount: number;
    scrollTop?: number | null;
  } | null>(null);
  const readCoverageByChatRef = useRef<
    Record<number, { top: number; bottom: number }>
  >({});
  const lastReadMessageIdByChatRef = useRef<Record<number, number>>({});
  const unreadCountOverrideByChatRef = useRef<Record<number, number>>({});
  const socketRef = useRef<Socket | null>(null);
  const activeChat = chats.find(
    (chat) => chat.id === activeChatId,
  );

  function getChatSessionStorageKey(key: string) {
    return `messenger:${user.userId}:${key}`;
  }

  function getChatScrollSessionStorageKey(chatId: number) {
    return getChatSessionStorageKey(`chat:${chatId}:scrollTop`);
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

  function saveChatScrollPosition(chatId: number, scrollTop: number) {
    window.sessionStorage.setItem(
      getChatScrollSessionStorageKey(chatId),
      String(Math.max(0, Math.round(scrollTop))),
    );
  }

  function getSavedChatScrollPosition(chatId: number) {
    return readNumberFromSessionStorage(
      getChatScrollSessionStorageKey(chatId),
    );
  }

  function applyLocalReadState(chat: Chat) {
    const localLastReadMessageId =
      lastReadMessageIdByChatRef.current[chat.id];
    const unreadCountOverride =
      unreadCountOverrideByChatRef.current[chat.id];

    if (
      localLastReadMessageId === undefined ||
      localLastReadMessageId <= (chat.current_last_read_message_id ?? 0)
    ) {
      return unreadCountOverride === undefined
        ? chat
        : { ...chat, unread_count: unreadCountOverride };
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

  function setLoadedChats(loadedChats: Chat[]) {
    setChats(sortChats(loadedChats.map(applyLocalReadState)));
  }

  function markChatReadThrough(
    chatId: number,
    messageId: number,
    options: {
      resetUnread?: boolean;
      unreadCountChange?: number;
    } = {},
  ) {
    const previousLastReadMessageId =
      lastReadMessageIdByChatRef.current[chatId] ?? 0;
    const nextLastReadMessageId = Math.max(
      previousLastReadMessageId,
      messageId,
    );

    lastReadMessageIdByChatRef.current[chatId] =
      nextLastReadMessageId;

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

        unreadCountOverrideByChatRef.current[chatId] =
          nextUnreadCount;

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
      setChatError(message);
    });
  }

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (activeChatIdRef.current !== null) {
        socket.emit("join_room", String(activeChatIdRef.current));
      }
      setStatus("Connected");
      setConnectionError(null);
    });

    socket.on("message", (data: ChatMessage) => {
      setMessages((current) => [
        ...current,
        { ...data, isOwn: data.sender_id === user.userId },
      ]);
      setChats((current) => updateChatPreview(current, data));
    });

    socket.on("chat_updated", (data: ChatUpdatedEvent) => {
      setChats((current) => updateChatPreview(current, data.last_message));

      apiFetch<Chat[]>("/chats")
        .then((loadedChats) => {
          setLoadedChats(loadedChats);
          setChatError(null);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to load chats.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setChatError(message);
        });
    });

    socket.on("chat_read", (data: ChatReadEvent) => {
      if (data.user_id === user.userId) {
        return;
      }

      setChats((current) =>
        current.map((chat) =>
          chat.id === data.chat_id
            ? {
                ...chat,
                other_last_read_message_id: data.last_read_message_id,
                other_last_read_at: data.last_read_at,
              }
            : chat,
        ),
      );

      apiFetch<Chat[]>("/chats")
        .then((loadedChats) => {
          setLoadedChats(loadedChats);
          setChatError(null);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to load chats.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setChatError(message);
        });
    });

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        onSessionExpired();
        return;
      }

      setStatus(reason);
    });

    socket.on("connect_error", (error) => {
      if (
        ["Not authenticated", "Invalid token", "User not found"].some(
          (message) => error.message.includes(message),
        )
      ) {
        onSessionExpired();
        return;
      }

      setStatus("Connection failed");
      setConnectionError(error.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [onSessionExpired, user.userId]);

  useEffect(() => {
    async function loadChats() {
      try {
        const loadedChats =
          await apiFetch<Chat[]>("/chats");

        setLoadedChats(loadedChats);
        setChatError(null);

        if (loadedChats.length > 0) {
          const savedActiveChatId = getSavedActiveChatId();
          const restoredChat =
            savedActiveChatId === null
              ? null
              : loadedChats.find((chat) => chat.id === savedActiveChatId);
          const selectedChat =
            restoredChat ??
            loadedChats.find(
              (chat) => chat.type === "self",
            ) ??
            loadedChats[0];

          pendingMessageScrollRef.current = {
            chatId: selectedChat.id,
            lastReadMessageId: selectedChat.current_last_read_message_id,
            unreadCount: selectedChat.unread_count,
            scrollTop:
              restoredChat === null
                ? null
                : getSavedChatScrollPosition(selectedChat.id),
          };
          activeChatIdRef.current = selectedChat.id;
          saveActiveChatId(selectedChat.id);
          setActiveChatId(selectedChat.id);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load chats.";

        if (message === "Could not validate credentials") {
          onSessionExpired();
          return;
        }

        setChatError(message);
      }
    }

    loadChats();
  }, [onSessionExpired]);

  useEffect(() => {
    if (activeChatId === null) {
      setMessages([]);
      return;
    }

    const controller = new AbortController();

    async function loadMessages() {
      try {
        const chatMessages = await apiFetch<ChatMessage[]>(
          `/chats/${activeChatId}/messages`,
          {
            signal: controller.signal,
          },
        );

        setMessages(chatMessages);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      }
    }

    loadMessages();

    return () => {
      controller.abort();
    };
  }, [activeChatId]);

  useEffect(() => {
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError(null);
    setMessageSearchHasSearched(false);
    setActiveSearchResultId(null);
  }, [activeChatId, draftRecipient?.id]);

  useEffect(() => {
    const query = messageSearchQuery.trim();

    if (activeChatId === null || !query) {
      setMessageSearchResults([]);
      setMessageSearchError(null);
      setMessageSearchLoading(false);
      setMessageSearchHasSearched(false);
      return;
    }

    const controller = new AbortController();

    setMessageSearchLoading(true);
    setMessageSearchError(null);
    setMessageSearchHasSearched(true);

    const timeoutId = window.setTimeout(() => {
      apiFetch<ChatMessage[]>(
        `/chats/${activeChatId}/messages/search?query=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
        },
      )
        .then((results) => {
          setMessageSearchResults(results);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setMessageSearchResults([]);

          const message =
            error instanceof Error
              ? error.message
              : "Unable to search messages.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setMessageSearchError(message);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setMessageSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeChatId, messageSearchQuery, onSessionExpired]);

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

    const activeMessages = getVisibleMessages(messages, activeChatId);

    const getCurrentLastReadMessageId = () =>
      Math.max(
        activeChat.current_last_read_message_id ?? 0,
        lastReadMessageIdByChatRef.current[activeChatId] ?? 0,
      );

    const getUnreadIncomingMessages = () =>
      activeMessages.filter(
        (entry) =>
          entry.sender_id !== user.userId &&
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

      markChatReadThrough(activeChatId, nextLastReadMessageId, {
        unreadCountChange: newlyReadCount,
      });
    };

    const updateReadCoverage = () => {
      const viewportTop = messagesElement.scrollTop;
      const viewportBottom =
        messagesElement.scrollTop + messagesElement.clientHeight;
      const previousCoverage =
        readCoverageByChatRef.current[activeChatId];
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

    const handleScroll = () => {
      saveChatScrollPosition(activeChatId, messagesElement.scrollTop);
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
  }, [
    activeChat,
    activeChatId,
    messages,
    onSessionExpired,
    user.userId,
  ]);

  useEffect(() => {
    const messagesElement = messagesRef.current;

    if (!messagesElement || activeChatId === null) {
      return;
    }

    const activeMessages = getVisibleMessages(messages, activeChatId);

    if (activeMessages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      const pendingScroll = pendingMessageScrollRef.current;

      if (
        pendingScroll &&
        pendingScroll.chatId === activeChatId &&
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

      if (
        pendingScroll &&
        pendingScroll.chatId === activeChatId &&
        pendingScroll.unreadCount > 0
      ) {
        const firstUnreadMessage = activeMessages.find(
          (entry) =>
            entry.sender_id !== user.userId &&
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

      messagesElement.scrollTop = messagesElement.scrollHeight;
      pendingMessageScrollRef.current = null;
      requestAnimationFrame(() => {
        messagesElement.dispatchEvent(new Event("scroll"));
      });
    });
  }, [activeChatId, messages.length, user.userId]);

  useEffect(() => {
    setProfileFirstName(user.firstName);
    setProfileLastName(user.lastName ?? "");
    setProfileBio(user.bio ?? "");
    setProfileAvatarUrl(user.avatarUrl);
  }, [user]);

  const handleSend = async () => {
    const socket = socketRef.current;
    if (!message.trim()) {
      return;
    }

    const outgoingMessage = message.trim();
    const tempId = crypto.randomUUID();
    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      chat_id: activeChatId ?? 0,
      sender_id: user.userId,
      sender_username: user.username,
      sender_avatar_url: user.avatarUrl,
      content: outgoingMessage,
      message_type: "text",
      reply_to_message_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      is_pinned: false,
      metadata: {},
      isOwn: true,
      delivery_status: "sending",
      temp_id: tempId,
    };

    if (draftRecipient) {
      setMessages([optimisticMessage]);
      setMessage("");

      try {
        const result = await apiFetch<DirectMessageResponse>(
          "/messages/direct",
          {
            method: "POST",
            body: JSON.stringify({
              recipient_id: draftRecipient.id,
              content: outgoingMessage,
            }),
          },
        );

        setChats((current) =>
          upsertChatPreview(current, result.chat, result.message),
        );
        activeChatIdRef.current = result.chat.id;
        saveActiveChatId(result.chat.id);
        setActiveChatId(result.chat.id);
        setDraftRecipient(null);
        setMessages([
          { ...result.message, isOwn: true, delivery_status: "sent" },
        ]);
        markChatReadThrough(result.chat.id, result.message.id, {
          resetUnread: true,
        });
        socket?.emit("join_room", String(result.chat.id));
      } catch (error) {
        setMessages((current) =>
          current.map((entry) =>
            entry.temp_id === tempId
              ? { ...entry, delivery_status: "failed" }
              : entry,
          ),
        );

        const errorMessage =
          error instanceof Error ? error.message : "Unable to send message.";

        if (errorMessage === "Could not validate credentials") {
          onSessionExpired();
          return;
        }

        setChatError(errorMessage);
      }

      return;
    }

    if (!socket || activeChatId === null) {
      return;
    }

    setMessages((current) => [...current, optimisticMessage]);
    setChats((current) =>
      updateChatPreview(current, optimisticMessage),
    );
    setMessage("");
    socket.emit(
      "message",
      {
        chat_id: activeChatId,
        content: outgoingMessage,
        message_type: "text",
      },
      (response: MessageAck) => {
        if (!response?.ok || !response.message) {
          setMessages((current) =>
            current.map((entry) =>
              entry.temp_id === tempId
                ? { ...entry, delivery_status: "failed" }
                : entry,
            ),
          );
          return;
        }

        const confirmedMessage = {
          ...response.message,
          isOwn: true,
          delivery_status: "sent" as const,
        };

        setMessages((current) =>
          replaceTemporaryMessage(current, tempId, confirmedMessage),
        );
        setChats((current) =>
          updateChatPreview(current, confirmedMessage),
        );
        markChatReadThrough(activeChatId, confirmedMessage.id, {
          resetUnread: true,
        });
      },
    );
  };

  const handleRetry = () => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    setStatus("Connecting...");
    setConnectionError(null);
    socket.connect();
  };

  const joinChat = (chat: Chat) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    const chatId = chat.id;

    if (activeChatIdRef.current !== null) {
      socket.emit("leave_room", String(activeChatIdRef.current));
    }
    socket.emit("join_room", String(chatId));
    pendingMessageScrollRef.current = {
      chatId,
      lastReadMessageId: chat.current_last_read_message_id,
      unreadCount: chat.unread_count,
    };
    activeChatIdRef.current = chatId;
    saveActiveChatId(chatId);
    setActiveChatId(chatId);
    setDraftRecipient(null);
    setMessages([]);
  };

  const toggleChatPin = async (chat: Chat) => {
    const nextIsPinned = !chat.is_pinned;

    setChats((current) =>
      sortChats(
        current.map((item) =>
          item.id === chat.id
            ? { ...item, is_pinned: nextIsPinned }
            : item,
        ),
      ),
    );

    try {
      const result = await apiFetch<ChatSettingsResponse>(
        `/chats/${chat.id}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_pinned: nextIsPinned }),
        },
      );

      setChats((current) =>
        sortChats(
          current.map((item) =>
            item.id === chat.id
              ? { ...item, is_pinned: result.is_pinned }
              : item,
          ),
        ),
      );
      setChatError(null);
    } catch (error) {
      setChats((current) =>
        sortChats(
          current.map((item) =>
            item.id === chat.id
              ? { ...item, is_pinned: chat.is_pinned }
              : item,
          ),
        ),
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to update chat settings.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    }
  };

  const handleProfileSearch = async (event: React.FormEvent) => {
    event.preventDefault();

    const username = profileQuery.trim();

    if (!username) {
      setProfileResult(null);
      setProfileError("Enter a username to search.");
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const profile = await apiFetch<UserProfile>(
        `/users/by-username/${encodeURIComponent(username)}`,
      );

      setProfileResult(profile);
    } catch (error) {
      setProfileResult(null);

      const message =
        error instanceof Error ? error.message : "Unable to find that user.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const revealMessageSearchResult = (entry: ChatMessage) => {
    setActiveSearchResultId(entry.id);

    const target = messagesRef.current?.querySelector(
      `[data-message-id="${entry.id}"]`,
    );

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center" });
      requestAnimationFrame(() => {
        messagesRef.current?.dispatchEvent(new Event("scroll"));
      });
    }
  };

  const renderMessageContent = (entry: ChatMessage) => {
    const content = entry.content ?? "";
    const query = messageSearchQuery.trim();

    if (!query || entry.id !== activeSearchResultId) {
      return content;
    }

    return highlightSearchText(content, query);
  };

  const handleProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!profileFirstName.trim()) {
      setProfileSaveMessage(null);
      setProfileSaveError("First name is required.");
      return;
    }

    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveMessage(null);

    try {
      const updatedUser = await apiFetch<AuthResponse>("/users/me/", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: profileFirstName.trim(),
          last_name: profileLastName.trim() || null,
          bio: profileBio.trim() || null,
          avatar_url: profileAvatarUrl.trim() || "/favicon.svg",
        }),
      });

      onUserUpdated(updatedUser);
      setProfileSaveMessage("Profile updated.");
      setEditingProfile(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update profile.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setProfileSaveError(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const getChatTitle = (chat: Chat) => {
    return chat.display_title || chat.title || "Chat";
  };

  const getChatSubtitle = (chat: Chat) => {
    if (chat.last_message_text) {
      const prefix =
        chat.last_message_sender_id === user.userId ? "You: " : "";

      return `${prefix}${chat.last_message_text}`;
    }

    if (chat.type === "self") {
      return "Private notes";
    }

    if (chat.type === "direct") {
      return "Direct message";
    }

    return chat.type;
  };

  const formatChatTime = (value: string | null) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMessageDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diffInDays = Math.floor(
      (startOfToday.getTime() - startOfMessageDay.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (diffInDays === 0) {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    }

    if (diffInDays > 0 && diffInDays <= 6) {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
      }).format(date);
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    }).format(date);
  };

  const formatMessageTime = (value: string | null) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  const formatMessageDay = (value: string | null) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (isToday) {
      return "Today";
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const isSameMessageDay = (
    first: string | null,
    second: string | null,
  ) => {
    if (!first || !second) {
      return false;
    }

    const firstDate = new Date(first);
    const secondDate = new Date(second);

    if (
      Number.isNaN(firstDate.getTime()) ||
      Number.isNaN(secondDate.getTime())
    ) {
      return false;
    }

    return (
      firstDate.getFullYear() === secondDate.getFullYear() &&
      firstDate.getMonth() === secondDate.getMonth() &&
      firstDate.getDate() === secondDate.getDate()
    );
  };

  const activeTitle = draftRecipient
    ? `${draftRecipient.first_name}${
        draftRecipient.last_name ? ` ${draftRecipient.last_name}` : ""
      }`
    : activeChat
      ? getChatTitle(activeChat)
      : "Chat";

  const openDraftChat = (profile: UserProfile) => {
    const socket = socketRef.current;

    if (activeChatIdRef.current !== null) {
      socket?.emit("leave_room", String(activeChatIdRef.current));
    }

    activeChatIdRef.current = null;
    setActiveChatId(null);
    setDraftRecipient(profile);
    setMessages([]);
    setMessage("");
  };

  const getSenderName = (entry: ChatMessage) => {
    if (entry.sender_id === user.userId) {
      return "You";
    }

    if (entry.sender_id === null) {
      return "System";
    }

    return entry.sender_username ?? `User ${entry.sender_id}`;
  };

  const getSenderAvatar = (entry: ChatMessage) => {
    if (entry.sender_id === user.userId) {
      return user.avatarUrl;
    }

    return entry.sender_avatar_url ?? "/favicon.svg";
  };

  const visibleMessages = getVisibleMessages(messages, activeChatId);
  const otherLastReadMessageId =
    activeChat?.other_last_read_message_id;
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

          return latestMessageId === null ||
            entry.id > latestMessageId
            ? entry.id
            : latestMessageId;
        }, null);

  const getMessageDeliveryStatus = (entry: ChatMessage) => {
    if (entry.sender_id !== user.userId) {
      return null;
    }

    if (entry.delivery_status === "sending") {
      return { kind: "sending", label: "Sending" };
    }

    if (entry.delivery_status === "failed") {
      return { kind: "failed", label: "Failed" };
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
  };

  return (
    <main className="chat-shell">
      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Chats">
          <div className="sidebar-profile">
            <div className="sidebar-profile-main">
              <img
                src={user.avatarUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = "/favicon.svg";
                }}
              />
              <div>
                <p>{user.firstName}</p>
                <span>@{user.username}</span>
              </div>
            </div>
            <div className="sidebar-profile-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingProfile((current) => !current);
                  setProfileSaveError(null);
                  setProfileSaveMessage(null);
                }}
              >
                {editingProfile ? "Close" : "Edit profile"}
              </Button>
              <Button variant="outline" size="sm" onClick={onSignOut}>
                Sign out
              </Button>
            </div>
          </div>
          <section className="profile-search" aria-label="Search user profiles">
            <form className="profile-search-form" onSubmit={handleProfileSearch}>
              <input
                type="search"
                value={profileQuery}
                placeholder="Search username"
                autoComplete="off"
                onChange={(event) => setProfileQuery(event.target.value)}
              />
              <Button type="submit" disabled={profileLoading}>
                {profileLoading ? "Searching..." : "Search"}
              </Button>
            </form>
            {profileError ? (
              <p className="profile-error">{profileError}</p>
            ) : null}
            {profileResult ? (
              <article className="profile-card">
                <img
                  src={profileResult.avatar_url}
                  alt=""
                  className="profile-avatar"
                />
                <div>
                  <h2>
                    {profileResult.first_name}
                    {profileResult.last_name ? ` ${profileResult.last_name}` : ""}
                  </h2>
                  <p className="profile-username">@{profileResult.username}</p>
                  {profileResult.bio ? (
                    <p className="profile-bio">{profileResult.bio}</p>
                  ) : null}
                  <span className="profile-status">{profileResult.status}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openDraftChat(profileResult)}
                >
                  Message
                </Button>
              </article>
            ) : null}
          </section>
          <div className="sidebar-section-label">Chats</div>
          <div className="chat-list">
            {chats.map((chat) => (
              (() => {
                const sentAt = formatChatTime(
                  chat.last_message_created_at,
                );
                const unreadCount =
                  chat.unread_count > 99 ? "99+" : chat.unread_count;

                return (
                  <div
                    key={chat.id}
                    className={
                      [
                        "chat-list-item",
                        chat.id === activeChatId ? "active" : "",
                        chat.is_pinned ? "pinned" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  >
                    <button
                      type="button"
                      className="chat-open-button"
                      onClick={() => joinChat(chat)}
                    >
                      <img
                        src={
                          chat.display_avatar_url ||
                          chat.avatar_url ||
                          "/favicon.svg"
                        }
                        alt=""
                        onError={(event) => {
                          event.currentTarget.src = "/favicon.svg";
                        }}
                      />
                      <span>
                        <span className="chat-title-row">
                          <strong>{getChatTitle(chat)}</strong>
                          <span className="chat-title-meta">
                            {chat.unread_count > 0 ? (
                              <span
                                className="unread-badge"
                                aria-label={`${chat.unread_count} unread messages`}
                              >
                                {unreadCount}
                              </span>
                            ) : null}
                            {sentAt && chat.last_message_created_at ? (
                              <time dateTime={chat.last_message_created_at}>
                                {sentAt}
                              </time>
                            ) : null}
                          </span>
                        </span>
                        <small>{getChatSubtitle(chat)}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="chat-pin-button"
                      aria-label={
                        chat.is_pinned
                          ? `Unpin ${getChatTitle(chat)}`
                          : `Pin ${getChatTitle(chat)}`
                      }
                      aria-pressed={chat.is_pinned}
                      title={chat.is_pinned ? "Unpin" : "Pin"}
                      onClick={() => {
                        void toggleChatPin(chat);
                      }}
                    >
                      <Pin size={14} aria-hidden="true" />
                    </button>
                  </div>
                );
              })()
            ))}
            {draftRecipient ? (
              <div className="chat-list-item active">
                <button className="chat-open-button" type="button">
                  <img
                    src={draftRecipient.avatar_url}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.src = "/favicon.svg";
                    }}
                  />
                  <span>
                    <strong>
                      {draftRecipient.first_name}
                      {draftRecipient.last_name
                        ? ` ${draftRecipient.last_name}`
                        : ""}
                    </strong>
                    <small>New direct message</small>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </aside>
        <section className="chat-card">
        {editingProfile ? (
          <section className="profile-editor" aria-label="Edit your profile">
            <div className="profile-editor-header">
              <img src={profileAvatarUrl} alt="" className="profile-avatar" />
              <div>
                <h2>Edit profile</h2>
                <p>@{user.username}</p>
              </div>
            </div>
            <form className="profile-editor-form" onSubmit={handleProfileUpdate}>
              <label>
                First name
                <input
                  type="text"
                  value={profileFirstName}
                  maxLength={64}
                  onChange={(event) => setProfileFirstName(event.target.value)}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={profileLastName}
                  maxLength={64}
                  onChange={(event) => setProfileLastName(event.target.value)}
                />
              </label>
              <label>
                Bio
                <textarea
                  value={profileBio}
                  maxLength={70}
                  rows={3}
                  onChange={(event) => setProfileBio(event.target.value)}
                />
                <span>{profileBio.length}/70</span>
              </label>
              <label>
                Avatar URL
                <input
                  type="url"
                  value={profileAvatarUrl}
                  placeholder="/favicon.svg"
                  onChange={(event) => setProfileAvatarUrl(event.target.value)}
                />
              </label>
              {profileSaveError ? (
                <p className="profile-error">{profileSaveError}</p>
              ) : null}
              {profileSaveMessage ? (
                <p className="profile-success">{profileSaveMessage}</p>
              ) : null}
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving..." : "Save profile"}
              </Button>
            </form>
          </section>
        ) : null}

        <section className="message-search" aria-label="Search messages">
          <form
            className="message-search-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              type="search"
              value={messageSearchQuery}
              placeholder="Search in this chat"
              autoComplete="off"
              disabled={activeChatId === null}
              onChange={(event) => {
                const value = event.target.value;
                setMessageSearchQuery(value);
                setMessageSearchResults([]);
                setMessageSearchError(null);
                setMessageSearchHasSearched(false);
                setActiveSearchResultId(null);

                if (!value.trim()) {
                  setActiveSearchResultId(null);
                }
              }}
            />
          </form>

          {messageSearchError ? (
            <p className="profile-error">{messageSearchError}</p>
          ) : null}

          {messageSearchLoading ? (
            <p className="message-search-empty">Searching...</p>
          ) : null}

          {messageSearchResults.length > 0 ? (
            <div className="message-search-results">
              {messageSearchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={
                    result.id === activeSearchResultId
                      ? "active"
                      : undefined
                  }
                  onClick={() => revealMessageSearchResult(result)}
                >
                  <span>
                    <strong>{getSenderName(result)}</strong>
                    {result.created_at ? (
                      <time dateTime={result.created_at}>
                        {formatMessageTime(result.created_at)}
                      </time>
                    ) : null}
                  </span>
                  <small>
                    {highlightSearchText(
                      getSearchExcerpt(
                        result.content,
                        messageSearchQuery,
                      ),
                      messageSearchQuery,
                    )}
                  </small>
                </button>
              ))}
            </div>
          ) : null}

          {messageSearchHasSearched &&
          !messageSearchLoading &&
          !messageSearchError &&
          messageSearchResults.length === 0 ? (
            <p className="message-search-empty">No matching messages.</p>
          ) : null}
        </section>

        {chatError ? (
          <p className="profile-error">{chatError}</p>
        ) : null}

        <ul id="messages" ref={messagesRef}>
          {visibleMessages.length === 0 ? (
            <li className="empty-state">No messages yet in this chat.</li>
          ) : (
            visibleMessages.map((entry, index) => {
              const previousEntry = visibleMessages[index - 1];
              const sentAt = formatMessageTime(entry.created_at);
              const dayLabel = formatMessageDay(entry.created_at);
              const showDaySeparator =
                !previousEntry ||
                !isSameMessageDay(previousEntry.created_at, entry.created_at);
              const deliveryStatus = getMessageDeliveryStatus(entry);
              const messageKey = `${entry.sender_id ?? "system"}-${
                entry.id ?? index
              }`;

              return (
                <Fragment key={messageKey}>
                  {showDaySeparator && dayLabel ? (
                    <li className="message-day-separator">{dayLabel}</li>
                  ) : null}

                  <li
                    className={[
                      entry.sender_id === user.userId || entry.isOwn
                        ? "you"
                        : "server",
                      entry.id === activeSearchResultId
                        ? "search-highlight"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-message-id={entry.id}
                  >
                    <img
                      src={getSenderAvatar(entry)}
                      alt=""
                      className="message-avatar"
                      onError={(event) => {
                        event.currentTarget.src = "/favicon.svg";
                      }}
                    />
                    <div className="message-copy">
                      <span className="sender">{getSenderName(entry)}</span>
                      <span>{renderMessageContent(entry)}</span>
                      <span className="message-meta">
                        {sentAt && entry.created_at ? (
                          <time dateTime={entry.created_at}>{sentAt}</time>
                        ) : null}
                        {deliveryStatus ? (
                          <span
                            className={`message-status ${deliveryStatus.kind}`}
                            aria-label={deliveryStatus.label}
                            title={deliveryStatus.label}
                          >
                            {deliveryStatus.kind === "sending" ? (
                              <ClockArrowUp size={14} aria-hidden="true" />
                            ) : null}
                            {deliveryStatus.kind === "sent" ? (
                              <Check size={15} aria-hidden="true" />
                            ) : null}
                            {deliveryStatus.kind === "read" ? (
                              <CheckCheck size={16} aria-hidden="true" />
                            ) : null}
                            {deliveryStatus.kind === "failed" ? (
                              <span aria-hidden="true">!</span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                </Fragment>
              );
            })
          )}
        </ul>

        <div className="composer">
          <input
            id="message"
            type="text"
            value={message}
            placeholder={`Message ${activeTitle}`}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={
              status !== "Connected" ||
              (activeChatId === null && draftRecipient === null)
            }
          >
            Send
          </button>
        </div>
        {status !== "Connected" ? (
          <div className="connection-retry">
            {connectionError ? (
              <p className="status-copy">{connectionError}</p>
            ) : null}
            <button className="retry-button" onClick={handleRetry}>
              Retry connection
            </button>
          </div>
        ) : null}
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadCurrentUser() {
      try {
        const currentUser = await apiFetch<AuthResponse>("/users/me/");

        if (!ignore) {
          setUser(toAuthUser(currentUser));
        }
      } catch {
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setCheckingAuth(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      ignore = true;
    };
  }, []);

  const handleAuthSuccess = (authUser: AuthResponse) => {
    setUser(toAuthUser(authUser));
  };

  const handleUserUpdated = (authUser: AuthResponse) => {
    setUser(toAuthUser(authUser));
  };

  const handleSignOut = async () => {
    try {
      await apiFetch<{ ok: boolean }>("/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error(error);
    }

    setUser(null);
    setAuthView("login");
  };

  const handleSessionExpired = () => {
    setUser(null);
    setAuthView("login");
  };

  if (checkingAuth) {
    return (
      <main className="chat-shell">
        <section className="chat-card">
          <p className="status-copy">Checking your session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return authView === "login" ? (
      <Login
        onSuccess={handleAuthSuccess}
        onGoToSignup={() => setAuthView("signup")}
      />
    ) : (
      <Signup
        onSuccess={handleAuthSuccess}
        onGoToLogin={() => setAuthView("login")}
      />
    );
  }

  return (
    <ChatScreen
      user={user}
      onSignOut={handleSignOut}
      onSessionExpired={handleSessionExpired}
      onUserUpdated={handleUserUpdated}
    />
  );
}
