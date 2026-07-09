import type { Dispatch, SetStateAction } from "react";

import { apiFetch } from "@/lib/api";
import { sortChats } from "@/lib/chat-helpers";
import type { Chat, ChatSettingsResponse } from "@/types";

type UseChatSettingsOptions = {
  setChats: Dispatch<SetStateAction<Chat[]>>;
  onSessionExpired: () => void;
  onError: (message: string) => void;
  onClearError: () => void;
};

export function useChatSettings({
  setChats,
  onSessionExpired,
  onError,
  onClearError,
}: UseChatSettingsOptions) {
  async function toggleChatPin(chat: Chat) {
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
      onClearError();
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

      onError(message);
    }
  }

  return { toggleChatPin };
}
