import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Socket } from "socket.io-client";

import { apiFetch } from "@/lib/api";
import {
  replaceTemporaryMessage,
  updateChatPreview,
  upsertChatPreview,
} from "@/lib/chat-helpers";
import { toReplyPreview } from "@/lib/message-helpers";
import type {
  AttachmentDraft,
  AuthUser,
  Chat,
  ChatMessage,
  DirectMessageResponse,
  UserProfile,
} from "@/types";

type MarkReadOptions = {
  resetUnread?: boolean;
  unreadCountChange?: number;
};

type UseMessageSendingOptions = {
  user: AuthUser;
  activeChatId: number | null;
  activeChat: Chat | undefined;
  activeChatIdRef: MutableRefObject<number | null>;
  socketRef: MutableRefObject<Socket | null>;
  draftRecipient: UserProfile | null;
  canSendTextMessages: boolean;
  message: string;
  replyToMessage: ChatMessage | null;
  attachmentDrafts: AttachmentDraft[];
  attachmentCaption: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setDraftRecipient: Dispatch<SetStateAction<UserProfile | null>>;
  setActiveChatId: Dispatch<SetStateAction<number | null>>;
  setReplyToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setAttachmentError: Dispatch<SetStateAction<string | null>>;
  removeAttachmentDraft: (draftId: string) => void;
  clearComposerDraft: (chatId: number) => void;
  markChatReadThrough: (
    chatId: number,
    messageId: number,
    options?: MarkReadOptions,
  ) => void;
  closeMessageMenu: () => void;
  closeMessageActionDialog: () => void;
  stopTypingActivity: (chatId?: number | null) => void;
  onSessionExpired: () => void;
  onError: (message: string) => void;
};

export function useMessageSending({
  user,
  activeChatId,
  activeChat,
  activeChatIdRef,
  socketRef,
  draftRecipient,
  canSendTextMessages,
  message,
  replyToMessage,
  attachmentDrafts,
  attachmentCaption,
  setMessages,
  setChats,
  setMessage,
  setDraftRecipient,
  setActiveChatId,
  setReplyToMessage,
  setAttachmentError,
  removeAttachmentDraft,
  clearComposerDraft,
  markChatReadThrough,
  closeMessageMenu,
  closeMessageActionDialog,
  stopTypingActivity,
  onSessionExpired,
  onError,
}: UseMessageSendingOptions) {
  const [voiceSending, setVoiceSending] = useState(false);
  const [fileSending, setFileSending] = useState(false);

  async function sendVoiceMessage(blob: Blob, durationMs: number) {
    if (activeChatId === null || blob.size === 0) {
      return;
    }

    const replyTarget = replyToMessage;
    const tempId = crypto.randomUUID();
    const objectUrl = URL.createObjectURL(blob);
    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      chat_id: activeChatId,
      sender_id: user.userId,
      sender_username: user.username,
      sender_avatar_url: user.avatarUrl,
      content: null,
      message_type: "voice",
      reply_to_message_id: replyTarget?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pinned_at: null,
      pinned_by: null,
      read_by_anyone: false,
      is_pinned_for_me: false,
      metadata: {
        audio_url: objectUrl,
        duration_ms: Math.max(1, Math.round(durationMs)),
        mime_type: blob.type,
        size_bytes: blob.size,
      },
      isOwn: true,
      delivery_status: "sending",
      temp_id: tempId,
      reply_to: replyTarget ? toReplyPreview(replyTarget) : null,
    };

    setVoiceSending(true);
    setMessages((current) => [...current, optimisticMessage]);
    setChats((current) => updateChatPreview(current, optimisticMessage));
    setReplyToMessage(null);
    closeMessageMenu();
    closeMessageActionDialog();
    clearComposerDraft(activeChatId);

    const formData = new FormData();
    formData.append("file", blob, `voice-${tempId}.webm`);
    formData.append("duration_ms", String(Math.max(1, Math.round(durationMs))));
    if (replyTarget) {
      formData.append("reply_to_message_id", String(replyTarget.id));
    }

    try {
      const responseMessage = await apiFetch<ChatMessage>(
        `/chats/${activeChatId}/messages/voice`,
        {
          method: "POST",
          body: formData,
        },
      );
      const confirmedMessage: ChatMessage = {
        ...responseMessage,
        isOwn: true,
        delivery_status: activeChat?.type === "self" ? "read" : "sent",
      };

      setMessages((current) =>
        replaceTemporaryMessage(current, tempId, confirmedMessage),
      );
      setChats((current) => updateChatPreview(current, confirmedMessage));
      markChatReadThrough(activeChatId, confirmedMessage.id, {
        resetUnread: true,
      });
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMessages((current) =>
        current.map((entry) =>
          entry.temp_id === tempId
            ? { ...entry, delivery_status: "failed" }
            : entry,
        ),
      );

      const errorMessage =
        error instanceof Error ? error.message : "Unable to send voice message.";

      if (errorMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(errorMessage);
    } finally {
      setVoiceSending(false);
    }
  }

  async function sendAttachmentDrafts() {
    if (attachmentDrafts.length === 0 || fileSending) {
      return;
    }

    if (draftRecipient) {
      onError("Send a text message first before attaching files.");
      return;
    }

    if (activeChatId === null) {
      return;
    }

    const drafts = attachmentDrafts;
    const caption = attachmentCaption.trim();
    const replyTarget = replyToMessage;
    const tempId = crypto.randomUUID();
    const attachments = drafts.map((draft) => ({
      file_url: draft.previewUrl,
      original_name: draft.originalName,
      mime_type: draft.mimeType,
      size_bytes: draft.sizeBytes,
      message_type: draft.messageType,
    }));
    const hasMultipleAttachments = attachments.length > 1;
    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      chat_id: activeChatId,
      sender_id: user.userId,
      sender_username: user.username,
      sender_avatar_url: user.avatarUrl,
      content: caption || null,
      message_type: hasMultipleAttachments ? "album" : drafts[0].messageType,
      reply_to_message_id: replyTarget?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pinned_at: null,
      pinned_by: null,
      read_by_anyone: false,
      is_pinned_for_me: false,
      metadata: hasMultipleAttachments ? { attachments } : attachments[0],
      isOwn: true,
      delivery_status: "sending",
      temp_id: tempId,
      reply_to: replyTarget ? toReplyPreview(replyTarget) : null,
    };

    setFileSending(true);
    setAttachmentError(null);
    setMessages((current) => [...current, optimisticMessage]);
    setChats((current) => updateChatPreview(current, optimisticMessage));
    setReplyToMessage(null);
    closeMessageMenu();
    closeMessageActionDialog();
    clearComposerDraft(activeChatId);

    const formData = new FormData();
    drafts.forEach((draft) => {
      if (draft.file) {
        formData.append("files", draft.file);
      }
    });
    if (caption) {
      formData.append("content", caption);
    }
    if (replyTarget) {
      formData.append("reply_to_message_id", String(replyTarget.id));
    }

    try {
      const responseMessage = await apiFetch<ChatMessage>(
        `/chats/${activeChatId}/messages/files`,
        {
          method: "POST",
          body: formData,
        },
      );
      const confirmedMessage: ChatMessage = {
        ...responseMessage,
        isOwn: true,
        delivery_status: activeChat?.type === "self" ? "read" : "sent",
      };

      setMessages((current) =>
        replaceTemporaryMessage(current, tempId, confirmedMessage),
      );
      setChats((current) => updateChatPreview(current, confirmedMessage));
      markChatReadThrough(activeChatId, confirmedMessage.id, {
        resetUnread: true,
      });
      drafts.forEach((draft) => removeAttachmentDraft(draft.id));
    } catch (error) {
      setMessages((current) =>
        current.map((entry) =>
          entry.temp_id === tempId
            ? { ...entry, delivery_status: "failed" }
            : entry,
        ),
      );

      const errorMessage =
        error instanceof Error ? error.message : "Unable to send file.";

      if (errorMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAttachmentError(errorMessage);
      onError(errorMessage);
    } finally {
      setFileSending(false);
    }
  }

  async function sendTextMessage() {
    const socket = socketRef.current;
    if (!canSendTextMessages || !message.trim()) {
      return;
    }

    const outgoingMessage = message.trim();
    stopTypingActivity();
    const replyTarget = draftRecipient ? null : replyToMessage;
    const tempId = crypto.randomUUID();
    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      chat_id: activeChatId ?? 0,
      sender_id: user.userId,
      sender_username: user.username,
      sender_avatar_url: user.avatarUrl,
      content: outgoingMessage,
      message_type: "text",
      reply_to_message_id: replyTarget?.id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pinned_at: null,
      pinned_by: null,
      read_by_anyone: false,
      is_pinned_for_me: false,
      metadata: {},
      isOwn: true,
      delivery_status: "sending",
      temp_id: tempId,
      reply_to: replyTarget ? toReplyPreview(replyTarget) : null,
    };

    if (draftRecipient) {
      setMessages([optimisticMessage]);
      setMessage("");
      setReplyToMessage(null);
      closeMessageMenu();
      closeMessageActionDialog();

      try {
        const result = await apiFetch<DirectMessageResponse>(
          "/messages/direct",
          {
            method: "POST",
            body: JSON.stringify({
              recipient_id: draftRecipient.id,
              content: outgoingMessage,
            }),
          },
        );

        setChats((current) =>
          upsertChatPreview(current, result.chat, result.message),
        );
        activeChatIdRef.current = result.chat.id;
        setActiveChatId(result.chat.id);
        setDraftRecipient(null);
        setMessages([
          { ...result.message, isOwn: true, delivery_status: "sent" },
        ]);
        markChatReadThrough(result.chat.id, result.message.id, {
          resetUnread: true,
        });
        socket?.emit("join_room", String(result.chat.id));
      } catch (error) {
        setMessages((current) =>
          current.map((entry) =>
            entry.temp_id === tempId
              ? { ...entry, delivery_status: "failed" }
              : entry,
          ),
        );

        const errorMessage =
          error instanceof Error ? error.message : "Unable to send message.";

        if (errorMessage === "Could not validate credentials") {
          onSessionExpired();
          return;
        }

        onError(errorMessage);
      }

      return;
    }

    if (activeChatId === null) {
      return;
    }

    setMessages((current) => [...current, optimisticMessage]);
    setChats((current) => updateChatPreview(current, optimisticMessage));
    setMessage("");
    setReplyToMessage(null);
    closeMessageMenu();
    closeMessageActionDialog();
    clearComposerDraft(activeChatId);

    try {
      const responseMessage = await apiFetch<ChatMessage>(
        `/chats/${activeChatId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: outgoingMessage,
            reply_to_message_id: replyTarget?.id ?? null,
          }),
        },
      );

      const confirmedMessage: ChatMessage = {
        ...responseMessage,
        isOwn: true,
        delivery_status: activeChat?.type === "self" ? "read" : "sent",
      };

      setMessages((current) =>
        replaceTemporaryMessage(current, tempId, confirmedMessage),
      );
      setChats((current) => updateChatPreview(current, confirmedMessage));
      markChatReadThrough(activeChatId, confirmedMessage.id, {
        resetUnread: true,
      });
    } catch (error) {
      setMessages((current) =>
        current.map((entry) =>
          entry.temp_id === tempId
            ? { ...entry, delivery_status: "failed" }
            : entry,
        ),
      );

      const errorMessage =
        error instanceof Error ? error.message : "Unable to send message.";

      if (errorMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      onError(errorMessage);
    }
  }

  return {
    voiceSending,
    fileSending,
    sendVoiceMessage,
    sendAttachmentDrafts,
    sendTextMessage,
  };
}
