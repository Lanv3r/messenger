import { useEffect, useEffectEvent, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/types";

type UseBlocksOptions = {
  onSessionExpired: () => void;
};

export function useBlocks({ onSessionExpired }: UseBlocksOptions) {
  const [blockedUserIds, setBlockedUserIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [blockingUserId, setBlockingUserId] = useState<number | null>(null);
  const blocksVersionRef = useRef(0);

  async function refreshBlocks() {
    const blocksVersion = blocksVersionRef.current;

    try {
      const blocks = await apiFetch<UserProfile[]>("/users/me/blocks");
      if (blocksVersion !== blocksVersionRef.current) {
        return;
      }

      setBlockedUserIds(new Set(blocks.map((profile) => profile.id)));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load blocked users.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
      }
    }
  }

  const loadBlocksFromEffect = useEffectEvent(refreshBlocks);

  useEffect(() => {
    void loadBlocksFromEffect();
  }, []);

  function isBlocked(userId: number) {
    return blockedUserIds.has(userId);
  }

  async function toggleBlock(userId: number) {
    if (blockingUserId !== null) {
      return false;
    }

    const removingBlock = isBlocked(userId);
    setBlockingUserId(userId);

    try {
      await apiFetch<UserProfile>(`/users/me/blocks/${userId}`, {
        method: removingBlock ? "DELETE" : "PUT",
      });

      blocksVersionRef.current += 1;
      setBlockedUserIds((current) => {
        const next = new Set(current);
        if (removingBlock) {
          next.delete(userId);
        } else {
          next.add(userId);
        }
        return next;
      });
      return true;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update blocked users.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
      }
      return false;
    } finally {
      setBlockingUserId(null);
    }
  }

  return {
    isBlocked,
    blockingUserId,
    toggleBlock,
    refreshBlocks,
  };
}
