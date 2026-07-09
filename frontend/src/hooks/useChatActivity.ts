import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Socket } from "socket.io-client";

import { updateChatActivityState } from "@/lib/chat-helpers";
import type {
  Chat,
  ChatActivityState,
  ChatActivityUser,
  ChatRecordingVoiceEvent,
  ChatTypingEvent,
} from "@/types";

type UseChatActivityOptions = {
  socketRef: MutableRefObject<Socket | null>;
  activeChatIdRef: MutableRefObject<number | null>;
  currentUserId: number;
  hasDraftRecipient: boolean;
  setMessage: Dispatch<SetStateAction<string>>;
};

function getActivityUser(
  userId: number,
  username: string | null,
  displayName: string | null = null,
): ChatActivityUser {
  return {
    user_id: userId,
    display_name: displayName,
    username,
  };
}

function formatActivityNames(chat: Chat | undefined, users: ChatActivityUser[]) {
  if (chat?.type !== "group") {
    return null;
  }

  return users
    .slice(0, 2)
    .map(
      (activityUser) =>
        activityUser.display_name ??
        activityUser.username ??
        `User ${activityUser.user_id}`,
    )
    .join(", ");
}

export function useChatActivity({
  socketRef,
  activeChatIdRef,
  currentUserId,
  hasDraftRecipient,
  setMessage,
}: UseChatActivityOptions) {
  const [chatActivityByChatId, setChatActivityByChatId] = useState<
    Record<number, ChatActivityState>
  >({});
  const typingTimeoutRef = useRef<number | null>(null);
  const typingChatIdRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  const stopTypingActivity = useCallback((chatId = typingChatIdRef.current) => {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (!isTypingRef.current || chatId === null) {
      return;
    }

    socketRef.current?.emit("typing", {
      chat_id: chatId,
      is_typing: false,
    });
    isTypingRef.current = false;
    typingChatIdRef.current = null;
  }, [socketRef]);

  function handleMessageInputChange(value: string) {
    setMessage(value);

    if (hasDraftRecipient || activeChatIdRef.current === null) {
      return;
    }

    const chatId = activeChatIdRef.current;
    if (!value.trim()) {
      stopTypingActivity(chatId);
      return;
    }

    if (!isTypingRef.current || typingChatIdRef.current !== chatId) {
      if (isTypingRef.current) {
        stopTypingActivity();
      }

      socketRef.current?.emit("typing", {
        chat_id: chatId,
        is_typing: true,
      });
      isTypingRef.current = true;
      typingChatIdRef.current = chatId;
    }

    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      stopTypingActivity(chatId);
    }, 1500);
  }

  function emitTypingStoppedBeforeDisconnect(socket: Socket) {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingRef.current && typingChatIdRef.current !== null) {
      socket.emit("typing", {
        chat_id: typingChatIdRef.current,
        is_typing: false,
      });
    }
  }

  function clearChatActivity() {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
    typingChatIdRef.current = null;
    setChatActivityByChatId({});
  }

  function clearUserActivity(
    chatId: number,
    userId: number | null,
    username: string | null,
  ) {
    if (userId === null) {
      return;
    }

    const activityUser = getActivityUser(userId, username);
    setChatActivityByChatId((current) =>
      updateChatActivityState(
        updateChatActivityState(
          current,
          chatId,
          activityUser,
          "typing",
          false,
        ),
        chatId,
        activityUser,
        "recording",
        false,
      ),
    );
  }

  function handleTypingActivity(data: ChatTypingEvent) {
    if (data.user_id === currentUserId) {
      return;
    }

    setChatActivityByChatId((current) =>
      updateChatActivityState(
        current,
        data.chat_id,
        getActivityUser(
          data.user_id,
          data.username,
          data.display_name ?? null,
        ),
        "typing",
        data.is_typing,
      ),
    );
  }

  function handleRecordingVoiceActivity(data: ChatRecordingVoiceEvent) {
    if (data.user_id === currentUserId) {
      return;
    }

    setChatActivityByChatId((current) =>
      updateChatActivityState(
        current,
        data.chat_id,
        getActivityUser(
          data.user_id,
          data.username,
          data.display_name ?? null,
        ),
        "recording",
        data.is_recording,
      ),
    );
  }

  function getChatActivitySubtitle(chat: Chat | undefined) {
    if (!chat) {
      return null;
    }

    const activity = chatActivityByChatId[chat.id];
    if (!activity) {
      return null;
    }

    if (activity.recording.length > 0) {
      return chat.type === "group"
        ? `${formatActivityNames(chat, activity.recording)} ${
            activity.recording.length === 1 ? "is" : "are"
          } recording a voice message...`
        : "recording a voice message...";
    }

    if (activity.typing.length > 0) {
      return chat.type === "group"
        ? `${formatActivityNames(chat, activity.typing)} ${
            activity.typing.length === 1 ? "is" : "are"
          } typing...`
        : "typing...";
    }

    return null;
  }

  return {
    stopTypingActivity,
    handleMessageInputChange,
    emitTypingStoppedBeforeDisconnect,
    clearChatActivity,
    clearUserActivity,
    handleTypingActivity,
    handleRecordingVoiceActivity,
    getChatActivitySubtitle,
  };
}
