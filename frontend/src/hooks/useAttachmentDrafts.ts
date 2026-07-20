import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  getAttachmentFileUrl,
  getFileMessageType,
} from "@/lib/message-helpers";
import type { AttachmentDraft, MessageAttachment } from "@/types";

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

  function revokeDraftPreview(previewUrl: string) {
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    return () => {
      draftsRef.current.forEach((draft) =>
        revokeDraftPreview(draft.previewUrl),
      );
    };
  }, []);

  function clearDrafts(draftsToClear = drafts) {
    draftsToClear.forEach((draft) => revokeDraftPreview(draft.previewUrl));
    setDrafts([]);
    setCaption("");
    setError(null);
  }

  function removeDraft(
    draftId: string,
    options: { preserveCaption?: boolean } = {},
  ) {
    setDrafts((current) => {
      const draft = current.find((entry) => entry.id === draftId);
      if (draft) {
        revokeDraftPreview(draft.previewUrl);
      }

      const nextDrafts = current.filter((entry) => entry.id !== draftId);
      if (nextDrafts.length === 0 && !options.preserveCaption) {
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
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
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

  function setDraftsFromAttachments(
    attachments: MessageAttachment[],
    nextCaption: string,
  ) {
    clearDrafts();
    setDrafts(
      attachments.map((attachment) => ({
        id: crypto.randomUUID(),
        existingAttachmentId: attachment.storage_key
          ? `key:${attachment.storage_key}`
          : `url:${attachment.file_url}`,
        previewUrl: getAttachmentFileUrl(attachment),
        messageType: attachment.message_type,
        originalName: attachment.original_name,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
      })),
    );
    setCaption(nextCaption);
    setError(null);
    onClearChatError();
  }

  return {
    drafts,
    caption,
    error,
    setCaption,
    setError,
    clearDrafts,
    removeDraft,
    addDrafts,
    setDraftsFromAttachments,
    handleFileInputChange,
  };
}
