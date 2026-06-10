import { useEffect, useRef, useState } from "react";
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
    return [nextChat, ...chats];
  }

  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1);
  return [nextChat, ...nextChats];
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
  const socketRef = useRef<Socket | null>(null);

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

        setChats(loadedChats);
        setChatError(null);

        if (loadedChats.length > 0) {
          const selfChat =
            loadedChats.find(
              (chat) => chat.type === "self",
            ) ?? loadedChats[0];

          activeChatIdRef.current = selfChat.id;
          setActiveChatId(selfChat.id);
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
    if (activeChatId === null || messages.length === 0) {
      return;
    }

    const lastPersistedMessage = [...messages]
      .reverse()
      .find(
        (entry) =>
          entry.delivery_status !== "sending" &&
          entry.delivery_status !== "failed",
      );

    if (!lastPersistedMessage) {
      return;
    }

    apiFetch<{ ok: boolean }>(`/chats/${activeChatId}/read`, {
      method: "POST",
      body: JSON.stringify({
        chat_id: activeChatId,
        last_read_message_id: lastPersistedMessage.id,
      }),
    }).catch((error) => {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
      }
    });
  }, [activeChatId, messages, onSessionExpired]);

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
        setActiveChatId(result.chat.id);
        setDraftRecipient(null);
        setMessages([
          { ...result.message, isOwn: true, delivery_status: "sent" },
        ]);
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

  const joinChat = (chatId: number) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    if (activeChatIdRef.current !== null) {
      socket.emit("leave_room", String(activeChatIdRef.current));
    }
    socket.emit("join_room", String(chatId));
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    setDraftRecipient(null);
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

  const activeChat = chats.find(
    (chat) => chat.id === activeChatId,
  );

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
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
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

  const getMessageDeliveryLabel = (entry: ChatMessage) => {
    if (entry.sender_id !== user.userId) {
      return null;
    }

    if (entry.delivery_status === "sending") {
      return "Sending";
    }

    if (entry.delivery_status === "failed") {
      return "Failed";
    }

    const otherLastReadMessageId =
      activeChat?.other_last_read_message_id;

    if (
      otherLastReadMessageId !== null &&
      otherLastReadMessageId !== undefined &&
      entry.id <= otherLastReadMessageId
    ) {
      if (
        entry.id === otherLastReadMessageId &&
        activeChat?.other_last_read_at
      ) {
        const readAt = formatChatTime(activeChat.other_last_read_at);
        return readAt ? `Read ${readAt}` : "Read";
      }

      return "Read";
    }

    return "Sent";
  };

  return (
    <main className="chat-shell">
      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Chats">
          <div className="sidebar-profile">
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
          <div className="sidebar-section-label">Chats</div>
          <div className="chat-list">
            {chats.map((chat) => (
              (() => {
                const sentAt = formatChatTime(
                  chat.last_message_created_at,
                );

                return (
                  <button
                    key={chat.id}
                    className={
                      chat.id === activeChatId
                        ? "active"
                        : undefined
                    }
                    onClick={() => joinChat(chat.id)}
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
                        {sentAt && chat.last_message_created_at ? (
                          <time dateTime={chat.last_message_created_at}>
                            {sentAt}
                          </time>
                        ) : null}
                      </span>
                      <small>{getChatSubtitle(chat)}</small>
                    </span>
                  </button>
                );
              })()
            ))}
            {draftRecipient ? (
              <button className="active" type="button">
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
            ) : null}
          </div>
        </aside>
        <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Messenger</p>
            <h1>{activeTitle}</h1>
            <p className="status-copy">Signed in as {user.username}</p>
          </div>
          <div className="status-stack">
            <span
              className={`status ${status === "Connected" ? "online" : ""}`}
            >
              {status}
            </span>
            {connectionError ? (
              <p className="status-copy">{connectionError}</p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingProfile((current) => !current);
                setProfileSaveError(null);
                setProfileSaveMessage(null);
              }}
            >
              {editingProfile ? "Close profile" : "Edit profile"}
            </Button>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </header>

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

        {chatError ? (
          <p className="profile-error">{chatError}</p>
        ) : null}

        <ul id="messages">
          {messages.length === 0 ? (
            <li className="empty-state">No messages yet in this chat.</li>
          ) : (
            messages.map((entry, index) => {
              const sentAt = formatChatTime(entry.created_at);
              const deliveryLabel = getMessageDeliveryLabel(entry);

              return (
                <li
                  key={`${entry.sender_id ?? "system"}-${entry.id ?? index}`}
                  className={entry.isOwn ? "you" : "server"}
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
                    <span>{entry.content}</span>
                    <span className="message-meta">
                      {sentAt && entry.created_at ? (
                        <time dateTime={entry.created_at}>{sentAt}</time>
                      ) : null}
                      {deliveryLabel ? (
                        <span
                          className={
                            entry.delivery_status === "failed"
                              ? "message-status failed"
                              : "message-status"
                          }
                        >
                          {deliveryLabel}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
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
          <button className="retry-button" onClick={handleRetry}>
            Retry connection
          </button>
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
