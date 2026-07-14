import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { Chat, MemberPermissions } from "@/types";

type UseChatPermissionsOptions = {
  activeChat: Chat | undefined;
  onSessionExpired: () => void;
};

export function useChatPermissions({
  activeChat,
  onSessionExpired,
}: UseChatPermissionsOptions) {
  const [permissions, setPermissions] = useState<{
    chatId: number;
    value: MemberPermissions;
  } | null>(null);
  const groupChatId = activeChat?.type === "group" ? activeChat.id : null;

  const fetchPermissions = useCallback(
    async (chatId: number) => {
      try {
        return await apiFetch<MemberPermissions>(`/chats/${chatId}/permissions`);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Could not validate credentials"
        ) {
          onSessionExpired();
        }

        return null;
      }
    },
    [onSessionExpired],
  );

  useEffect(() => {
    let cancelled = false;

    if (groupChatId === null) {
      return;
    }
    const chatId = groupChatId;

    async function loadActiveChatPermissions() {
      const nextPermissions = await fetchPermissions(chatId);

      if (!cancelled && nextPermissions) {
        setPermissions({ chatId, value: nextPermissions });
      }
    }

    void loadActiveChatPermissions();

    return () => {
      cancelled = true;
    };
  }, [fetchPermissions, groupChatId]);

  const refreshPermissions = useCallback(
    (chatId: number) => {
      if (chatId !== groupChatId) {
        return;
      }

      void fetchPermissions(chatId).then((nextPermissions) => {
        if (nextPermissions) {
          setPermissions({ chatId, value: nextPermissions });
        }
      });
    },
    [fetchPermissions, groupChatId],
  );

  return {
    canSendTextMessages:
      groupChatId === null ||
      permissions?.chatId !== groupChatId ||
      permissions.value.send_messages !== false,
    refreshPermissions,
  };
}
