import { useEffect, useEffectEvent, useState, type MutableRefObject } from "react";
import { io, type Socket } from "socket.io-client";

import { API_URL } from "@/lib/api";
import type {
  Chat,
  ChatMembersUpdatedEvent,
  ChatMessage,
  ChatReadEvent,
  ChatRecordingVoiceEvent,
  ChatTypingEvent,
  ChatUpdatedEvent,
  DirectMessageAccessUpdatedEvent,
  MessageDeletedEvent,
  MessagePinUpdatedEvent,
  RemovedFromChatEvent,
} from "@/types";

type UseChatSocketOptions = {
  socketRef: MutableRefObject<Socket | null>;
  activeChatIdRef: MutableRefObject<number | null>;
  userId: number;
  onSessionExpired: () => void;
  onBeforeDisconnect: (socket: Socket) => void;
  onMessage: (data: ChatMessage) => void;
  onChatUpdated: (data: ChatUpdatedEvent) => void;
  onChatCreated: (data: Chat) => void;
  onChatMembersUpdated: (data: ChatMembersUpdatedEvent) => void;
  onRemovedFromChat: (data: RemovedFromChatEvent, socket: Socket) => void;
  onMessagePinUpdated: (data: MessagePinUpdatedEvent) => void;
  onMessageUpdated: (data: ChatMessage) => void;
  onMessageDeleted: (data: MessageDeletedEvent) => void;
  onChatRead: (data: ChatReadEvent) => void;
  onDirectMessageAccessUpdated: (
    data: DirectMessageAccessUpdatedEvent,
  ) => void;
  onTyping: (data: ChatTypingEvent) => void;
  onRecordingVoice: (data: ChatRecordingVoiceEvent) => void;
  onDisconnected: (reason: Socket.DisconnectReason) => void;
};

export function useChatSocket({
  socketRef,
  activeChatIdRef,
  userId,
  onSessionExpired,
  onBeforeDisconnect,
  onMessage,
  onChatUpdated,
  onChatCreated,
  onChatMembersUpdated,
  onRemovedFromChat,
  onMessagePinUpdated,
  onMessageUpdated,
  onMessageDeleted,
  onChatRead,
  onDirectMessageAccessUpdated,
  onTyping,
  onRecordingVoice,
  onDisconnected,
}: UseChatSocketOptions) {
  const [status, setStatus] = useState("Connecting...");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const sessionExpired = useEffectEvent(onSessionExpired);
  const beforeDisconnect = useEffectEvent(onBeforeDisconnect);
  const handleMessage = useEffectEvent(onMessage);
  const handleChatUpdated = useEffectEvent(onChatUpdated);
  const handleChatCreated = useEffectEvent(onChatCreated);
  const handleChatMembersUpdated = useEffectEvent(onChatMembersUpdated);
  const handleRemovedFromChat = useEffectEvent(onRemovedFromChat);
  const handleMessagePinUpdated = useEffectEvent(onMessagePinUpdated);
  const handleMessageUpdated = useEffectEvent(onMessageUpdated);
  const handleMessageDeleted = useEffectEvent(onMessageDeleted);
  const handleChatRead = useEffectEvent(onChatRead);
  const handleDirectMessageAccessUpdated = useEffectEvent(
    onDirectMessageAccessUpdated,
  );
  const handleTyping = useEffectEvent(onTyping);
  const handleRecordingVoice = useEffectEvent(onRecordingVoice);
  const handleDisconnected = useEffectEvent(onDisconnected);

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

    socket.on("message", handleMessage);
    socket.on("chat_updated", handleChatUpdated);
    socket.on("chat_created", handleChatCreated);
    socket.on("chat_members_updated", handleChatMembersUpdated);
    socket.on("removed_from_chat", (data: RemovedFromChatEvent) => {
      handleRemovedFromChat(data, socket);
    });
    socket.on("message_pin_updated", handleMessagePinUpdated);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("chat_read", handleChatRead);
    socket.on(
      "direct_message_access_updated",
      handleDirectMessageAccessUpdated,
    );
    socket.on("typing", handleTyping);
    socket.on("recording_voice", handleRecordingVoice);

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        sessionExpired();
        return;
      }

      handleDisconnected(reason);
      setStatus(reason);
    });

    socket.on("connect_error", (error) => {
      if (
        ["Not authenticated", "Invalid token", "User not found"].some(
          (message) => error.message.includes(message),
        )
      ) {
        sessionExpired();
        return;
      }

      setStatus("Connection failed");
      setConnectionError(error.message);
    });

    return () => {
      beforeDisconnect(socket);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeChatIdRef, socketRef, userId]);

  const retry = () => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    setStatus("Connecting...");
    setConnectionError(null);
    socket.connect();
  };

  return {
    status,
    connectionError,
    retry,
  };
}
