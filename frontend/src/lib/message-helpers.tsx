import { Fragment } from "react";

import { API_URL } from "@/lib/api";
import type { AuthResponse, AuthUser, ChatMessage, MessageReplyPreview } from "@/types";

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSearchExcerpt(content: string | null, query: string) {
  if (!content) {
    return "No message text";
  }

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return content;
  }

  const matchIndex = content.toLowerCase().indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return content;
  }

  const contextLength = 42;
  const matchEnd = matchIndex + normalizedQuery.length;
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(content.length, matchEnd + contextLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";

  return `${prefix}${content.slice(start, end)}${suffix}`;
}

export function highlightSearchText(content: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return content;
  }

  const parts = content.split(
    new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi"),
  );

  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery ? (
      <mark className="message-search-match" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

export function readNumberFromSessionStorage(key: string) {
  const value = window.sessionStorage.getItem(key);

  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function toAuthUser(authUser: AuthResponse): AuthUser {
  return {
    userId: authUser.id,
    username: authUser.username,
    firstName: authUser.first_name,
    lastName: authUser.last_name,
    bio: authUser.bio ?? null,
    avatarUrl: getAssetUrl(authUser.avatar_url),
    status: authUser.status ?? "online",
  };
}

export function getAssetUrl(
  value: string | null | undefined,
  fallback = "/favicon.svg",
) {
  const url = value?.trim();

  if (!url) {
    return fallback;
  }

  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("http")
  ) {
    return url;
  }

  if (url.startsWith("/uploads/")) {
    return `${API_URL}${url}`;
  }

  return url;
}

export function getMessagePreviewText(entry: ChatMessage) {
  if (entry.message_type === "deleted") {
    return "message deleted";
  }

  const content = entry.content?.trim();
  if (content) {
    return content;
  }

  if (entry.message_type === "voice") {
    return "Voice message";
  }

  if (entry.message_type === "image") {
    return "Photo";
  }

  if (entry.message_type === "video") {
    return "Video";
  }

  if (entry.message_type === "audio") {
    return "Audio file";
  }

  if (entry.message_type === "file") {
    return "File";
  }

  return entry.message_type === "text" ? "Message" : entry.message_type;
}

export function getReplyPreviewText(reply: MessageReplyPreview) {
  if (reply.message_type === "deleted") {
    return "message deleted";
  }

  const content = reply.content?.trim();
  if (content) {
    return content;
  }

  if (reply.message_type === "voice") {
    return "Voice message";
  }

  if (reply.message_type === "image") {
    return "Photo";
  }

  if (reply.message_type === "video") {
    return "Video";
  }

  if (reply.message_type === "audio") {
    return "Audio file";
  }

  if (reply.message_type === "file") {
    return "File";
  }

  return reply.message_type === "text" ? "Message" : reply.message_type;
}

export function toReplyPreview(entry: ChatMessage): MessageReplyPreview {
  return {
    id: entry.id,
    sender_id: entry.sender_id,
    sender_username: entry.sender_username,
    content: entry.content,
    message_type: entry.message_type,
  };
}

export function getVoiceAudioUrl(entry: ChatMessage) {
  const audioUrl = entry.metadata?.audio_url;

  if (typeof audioUrl !== "string" || !audioUrl) {
    return null;
  }

  if (audioUrl.startsWith("blob:") || audioUrl.startsWith("http")) {
    return audioUrl;
  }

  return `${API_URL}${audioUrl}`;
}

export function getUploadedFileUrl(entry: ChatMessage) {
  const fileUrl = entry.metadata?.file_url;

  if (typeof fileUrl !== "string" || !fileUrl) {
    return null;
  }

  if (fileUrl.startsWith("blob:") || fileUrl.startsWith("http")) {
    return fileUrl;
  }

  return `${API_URL}${fileUrl}`;
}

export function getUploadedFileName(entry: ChatMessage) {
  const originalName = entry.metadata?.original_name;
  return typeof originalName === "string" && originalName
    ? originalName
    : "Download file";
}

export function formatFileSize(sizeBytes: unknown) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes)) {
    return null;
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const kilobytes = sizeBytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export function getFileMessageType(file: File) {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  return "file";
}

export function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function markReplyPreviewDeleted(
  entry: ChatMessage,
  deletedMessageId: number,
): ChatMessage {
  if (entry.reply_to?.id !== deletedMessageId) {
    return entry;
  }

  return {
    ...entry,
    reply_to: {
      id: deletedMessageId,
      sender_id: null,
      sender_username: null,
      content: "message deleted",
      message_type: "deleted",
    },
  };
}
