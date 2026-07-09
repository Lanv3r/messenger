import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { getFileMessageType } from "@/lib/message-helpers";
import type { AttachmentDraft } from "@/types";

type UseAttachmentDraftsOptions = {
  activeChatId: number | null;
  hasDraftRecipient: boolean;
  onChatError: (message: string) => void;
  onClearChatError: () => void;
};

export function useAttachmentDrafts({
  activeChatId,
  hasDraftRecipient,
  onChatError,
  onClearChatError,
}: UseAttachmentDraftsOptions) {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draftsRef = useRef<AttachmentDraft[]>([]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    return () => {
      draftsRef.current.forEach((draft) =>
        URL.revokeObjectURL(draft.previewUrl),
      );
    };
  }, []);

  function clearDrafts(draftsToClear = drafts) {
    draftsToClear.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
    setDrafts([]);
    setCaption("");
    setError(null);
  }

  function removeDraft(draftId: string) {
    setDrafts((current) => {
      const draft = current.find((entry) => entry.id === draftId);
      if (draft) {
        URL.revokeObjectURL(draft.previewUrl);
      }

      const nextDrafts = current.filter((entry) => entry.id !== draftId);
      if (nextDrafts.length === 0) {
        setCaption("");
        setError(null);
      }

      return nextDrafts;
    });
  }

  function addDrafts(files: File[]) {
    if (hasDraftRecipient) {
      onChatError("Send a text message first before attaching files.");
      return;
    }

    if (activeChatId === null) {
      onChatError("Select a chat before attaching files.");
      return;
    }

    const nextDrafts = files
      .filter((file) => file.size > 0)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        messageType: getFileMessageType(file),
      }));

    if (nextDrafts.length === 0) {
      return;
    }

    setDrafts((current) => [...current, ...nextDrafts]);
    setError(null);
    onClearChatError();
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    addDrafts(files);
  }

  return {
    drafts,
    caption,
    error,
    setCaption,
    setError,
    clearDrafts,
    removeDraft,
    handleFileInputChange,
  };
}
