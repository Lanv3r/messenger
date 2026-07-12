import type { Dispatch, SetStateAction } from "react";

import { apiFetch } from "@/lib/api";
import { sortChats } from "@/lib/chat-helpers";
import type {
  Chat,
  ChatSettingsResponse,
  PinnedChatOrderResponse,
} from "@/types";

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
  function getNextPinnedOrder(chats: Chat[]) {
    return (
      chats.reduce(
        (maxOrder, chat) =>
          chat.is_pinned && chat.pinned_order !== null
            ? Math.max(maxOrder, chat.pinned_order)
            : maxOrder,
        0,
      ) + 1
    );
  }

  async function toggleChatPin(chat: Chat) {
    const nextIsPinned = !chat.is_pinned;
    let previousChats: Chat[] = [];

    setChats((current) => {
      previousChats = current;
      const nextPinnedOrder = nextIsPinned ? getNextPinnedOrder(current) : null;

      return sortChats(
        current.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                is_pinned: nextIsPinned,
                pinned_order: nextPinnedOrder,
              }
            : item,
        ),
      );
    });

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
              ? {
                  ...item,
                  is_pinned: result.is_pinned,
                  pinned_order: result.pinned_order,
                }
              : item,
          ),
        ),
      );
      onClearError();
    } catch (error) {
      setChats(previousChats);

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

  async function reorderPinnedChats(chatIds: number[]) {
    let previousChats: Chat[] = [];

    setChats((current) => {
      previousChats = current;
      const orderByChatId = new Map(
        chatIds.map((chatId, index) => [chatId, index + 1]),
      );

      return sortChats(
        current.map((chat) =>
          orderByChatId.has(chat.id)
            ? { ...chat, pinned_order: orderByChatId.get(chat.id) ?? null }
            : chat,
        ),
      );
    });

    try {
      await apiFetch<PinnedChatOrderResponse>("/chats/pinned-order", {
        method: "PATCH",
        body: JSON.stringify({ chat_ids: chatIds }),
      });
      onClearError();
    } catch (error) {
      setChats(previousChats);

      const message =
        error instanceof Error
          ? error.message
          : "Unable to update pinned chat order.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(message);
    }
  }

  return { toggleChatPin, reorderPinnedChats };
}
