import { useEffect, useRef, useState } from "react";

import type { ChatMessage, MessageActionDialogState } from "@/types";

type MessageMenuPosition = {
  x: number;
  y: number;
};

export function useMessageActionMenu() {
  const [openMessageMenuId, setOpenMessageMenuId] = useState<number | null>(
    null,
  );
  const [messageMenuPosition, setMessageMenuPosition] =
    useState<MessageMenuPosition | null>(null);
  const messageMenuOpenedAtRef = useRef(0);
  const [messageActionDialog, setMessageActionDialog] =
    useState<MessageActionDialogState | null>(null);
  const [actionAlsoForOtherUser, setActionAlsoForOtherUser] = useState(false);

  const openMessageMenu = (
    messageId: number,
    position: MessageMenuPosition,
  ) => {
    setMessageMenuPosition(position);
    messageMenuOpenedAtRef.current = Date.now();
    setOpenMessageMenuId(messageId);
  };

  const closeMessageMenu = () => {
    setOpenMessageMenuId(null);
    setMessageMenuPosition(null);
  };

  const openMessageActionDialog = (
    kind: MessageActionDialogState["kind"],
    entry: ChatMessage,
  ) => {
    closeMessageMenu();
    setActionAlsoForOtherUser(false);
    setMessageActionDialog({ kind, entry });
  };

  const closeMessageActionDialog = () => {
    setMessageActionDialog(null);
    setActionAlsoForOtherUser(false);
  };

  const closeMessageStateForMessage = (messageId: number) => {
    setOpenMessageMenuId((current) =>
      current === messageId ? null : current,
    );
    setMessageMenuPosition(null);
    setMessageActionDialog((current) =>
      current?.entry.id === messageId ? null : current,
    );
  };

  useEffect(() => {
    if (openMessageMenuId === null) {
      return;
    }

    const closeOpenMenu = () => {
      setOpenMessageMenuId(null);
      setMessageMenuPosition(null);
    };

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      if (Date.now() - messageMenuOpenedAtRef.current < 250) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest(".message-context-menu")
      ) {
        return;
      }

      closeOpenMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOpenMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMessageMenuId]);

  return {
    openMessageMenuId,
    messageMenuPosition,
    messageActionDialog,
    actionAlsoForOtherUser,
    setActionAlsoForOtherUser,
    openMessageMenu,
    closeMessageMenu,
    openMessageActionDialog,
    closeMessageActionDialog,
    closeMessageStateForMessage,
  };
}
