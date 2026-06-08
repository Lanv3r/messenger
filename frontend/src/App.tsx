import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { API_URL, apiFetch } from "@/lib/api";
import Login from "@/Login";
import Signup from "@/Signup";
import { Button } from "@/components/ui/button";
import "./App.css";

type ChatMessage = {
  id: number;
  conversation_id: number;
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

const conversations = [{ id: 1, title: "General" }] as const;

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
  const [activeConversationId, setActiveConversationId] = useState<number>(
    conversations[0].id,
  );
  const activeConversationIdRef = useRef<number>(conversations[0].id);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting...");
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
      socket.emit("join_room", String(activeConversationIdRef.current));
      setStatus("Connected");
      setConnectionError(null);
    });

    socket.on("message", (data: ChatMessage) => {
      setMessages((current) => [
        ...current,
        { ...data, isOwn: data.sender_id === user.userId },
      ]);
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
    const controller = new AbortController();

    async function loadMessages() {
      try {
        const roomMessages = await apiFetch<ChatMessage[]>(
          `/rooms/${activeConversationId}/messages`,
          {
            signal: controller.signal,
          },
        );

        setMessages(roomMessages);
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
  }, [activeConversationId]);

  useEffect(() => {
    setProfileFirstName(user.firstName);
    setProfileLastName(user.lastName ?? "");
    setProfileBio(user.bio ?? "");
    setProfileAvatarUrl(user.avatarUrl);
  }, [user]);

  const handleSend = () => {
    const socket = socketRef.current;
    if (!socket || !message.trim()) {
      return;
    }

    const outgoingMessage = message.trim();
    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      conversation_id: activeConversationId,
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
    };

    setMessages((current) => [...current, optimisticMessage]);
    socket.emit("message", {
      conversation_id: activeConversationId,
      content: outgoingMessage,
      message_type: "text",
    });
    setMessage("");
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

  const joinConversation = (conversationId: number) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socket.emit("leave_room", String(activeConversationIdRef.current));
    socket.emit("join_room", String(conversationId));
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
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

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

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

  return (
    <main className="chat-shell">
      <div>
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => joinConversation(conversation.id)}
          >
            {conversation.title}
          </button>
        ))}
      </div>
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Messenger</p>
            <h1>{activeConversation?.title ?? "Conversation"}</h1>
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
            </article>
          ) : null}
        </section>

        <ul id="messages">
          {messages.length === 0 ? (
            <li className="empty-state">No messages yet in this room.</li>
          ) : (
            messages.map((entry, index) => (
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
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="composer">
          <input
            id="message"
            type="text"
            value={message}
            placeholder={`Message ${activeConversation?.title ?? ""}`}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
          />
          <button onClick={handleSend} disabled={status !== "Connected"}>
            Send
          </button>
        </div>
        {status !== "Connected" ? (
          <button className="retry-button" onClick={handleRetry}>
            Retry connection
          </button>
        ) : null}
      </section>
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
