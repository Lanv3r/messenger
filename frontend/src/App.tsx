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
};

type AuthResponse = {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
};

const conversations = [{ id: 1, title: "General" }] as const;

function toAuthUser(authUser: AuthResponse): AuthUser {
  return {
    userId: authUser.id,
    username: authUser.username,
    firstName: authUser.first_name,
    lastName: authUser.last_name,
  };
}

function ChatScreen({
  user,
  onSignOut,
}: {
  user: AuthUser;
  onSignOut: () => void;
}) {
  const [activeConversationId, setActiveConversationId] = useState<number>(
    conversations[0].id,
  );
  const activeConversationIdRef = useRef<number>(conversations[0].id);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting...");
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
      setStatus(reason);
    });

    socket.on("connect_error", (error) => {
      setStatus("Connection failed");
      setConnectionError(error.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user.userId]);

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
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </header>

        <ul id="messages">
          {messages.length === 0 ? (
            <li className="empty-state">No messages yet in this room.</li>
          ) : (
            messages.map((entry, index) => (
              <li
                key={`${entry.sender_id ?? "system"}-${entry.id ?? index}`}
                className={entry.isOwn ? "you" : "server"}
              >
                <span className="sender">{getSenderName(entry)}</span>
                <span>{entry.content}</span>
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

  return <ChatScreen user={user} onSignOut={handleSignOut} />;
}
