import { Fragment } from "react";

import { API_URL } from "@/lib/api";
import type {
  AuthResponse,
  AuthUser,
  ChatMessage,
  MessageAttachment,
  MessageReplyPreview,
} from "@/types";

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

  const attachments = getMessageAttachments(entry);
  if (attachments.length > 1) {
    const attachmentTypes = new Set(
      attachments.map((attachment) => attachment.message_type),
    );
    if (attachmentTypes.size === 1 && attachmentTypes.has("image")) {
      return `${attachments.length} photos`;
    }

    return `${attachments.length} attachments`;
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

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function getMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeUploadedUrl(url: string) {
  if (url.startsWith("blob:") || url.startsWith("http")) {
    return url;
  }

  return `${API_URL}${url}`;
}

function readAttachment(value: unknown): MessageAttachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const metadata = value as Record<string, unknown>;
  const fileUrl = getMetadataString(metadata, "file_url");
  if (!fileUrl) {
    return null;
  }

  const messageType = getMetadataString(metadata, "message_type") ?? "file";
  const originalName =
    getMetadataString(metadata, "original_name") ?? "Download file";
  const mimeType = getMetadataString(metadata, "mime_type") ?? "";
  const sizeBytes = getMetadataNumber(metadata, "size_bytes") ?? 0;

  return {
    file_url: fileUrl,
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    message_type: messageType,
  };
}

export function getMessageAttachments(
  entry: Pick<ChatMessage, "message_type" | "metadata">,
): MessageAttachment[] {
  const attachments = entry.metadata?.attachments;
  if (Array.isArray(attachments)) {
    return attachments
      .map((attachment) => readAttachment(attachment))
      .filter((attachment): attachment is MessageAttachment =>
        Boolean(attachment),
      );
  }

  const fileUrl = getMetadataString(entry.metadata, "file_url");
  if (!fileUrl) {
    return [];
  }

  return [
    {
      file_url: fileUrl,
      original_name:
        getMetadataString(entry.metadata, "original_name") ?? "Download file",
      mime_type: getMetadataString(entry.metadata, "mime_type") ?? "",
      size_bytes: getMetadataNumber(entry.metadata, "size_bytes") ?? 0,
      message_type: entry.message_type === "album" ? "file" : entry.message_type,
    },
  ];
}

export function getAttachmentFileUrl(attachment: MessageAttachment) {
  return normalizeUploadedUrl(attachment.file_url);
}

export function getUploadedFileUrl(entry: ChatMessage) {
  const attachment = getMessageAttachments(entry)[0];
  if (!attachment) {
    return null;
  }

  return getAttachmentFileUrl(attachment);
}

export function canCopyMessage(entry: ChatMessage) {
  if (entry.content) {
    return true;
  }

  return canCopyImageMessage(entry);
}

export function canCopyImageMessage(entry: ChatMessage) {
  const attachments = getMessageAttachments(entry);
  return (
    attachments.length === 1 &&
    attachments[0].message_type === "image" &&
    Boolean(getAttachmentFileUrl(attachments[0]))
  );
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for copying."));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to prepare image for copying."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function drawImageToCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image for copying.");
  }

  return { canvas, context };
}

async function decodeImageBlobWithElement(imageBlob: Blob) {
  const objectUrl = URL.createObjectURL(imageBlob);

  try {
    const image = await loadImageElement(objectUrl);
    const { canvas, context } = drawImageToCanvas(
      image.naturalWidth,
      image.naturalHeight,
    );
    context.drawImage(image, 0, 0);
    return await canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function imageBlobToPngBlob(imageBlob: Blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(imageBlob);
      try {
        const { canvas, context } = drawImageToCanvas(
          bitmap.width,
          bitmap.height,
        );
        context.drawImage(bitmap, 0, 0);
        return await canvasToPngBlob(canvas);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall back to HTMLImageElement below; Safari support varies here.
    }
  }

  return decodeImageBlobWithElement(imageBlob);
}

async function readImageCopyError(response: Response) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "detail" in data) {
    return `Unable to load image for copying: ${String(data.detail)}`;
  }

  return `Unable to load image for copying: ${response.status}`;
}

async function loadImageAsPngBlob(imageUrl: string) {
  const response = await fetch(imageUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await readImageCopyError(response));
  }

  const imageBlob = await response.blob();
  try {
    return await imageBlobToPngBlob(imageBlob);
  } catch {
    throw new Error("Unable to decode image for copying.");
  }
}

export async function copyMessageImageToClipboard(
  entry: ChatMessage,
  attachmentIndex?: number,
) {
  if (!navigator.clipboard) {
    throw new Error("Clipboard is not supported by this browser.");
  }

  const attachments = getMessageAttachments(entry);
  const attachment = attachments[attachmentIndex ?? 0];
  if (!attachment || attachment.message_type !== "image") {
    throw new Error("Image is unavailable.");
  }

  if (!navigator.clipboard.write || typeof ClipboardItem === "undefined") {
    const imageUrl = getAttachmentFileUrl(attachment);
    await navigator.clipboard.writeText(imageUrl);
    throw new Error(
      "Image copying is not supported by this browser, so the image link was copied instead.",
    );
  }

  const hasAttachmentList = Array.isArray(entry.metadata?.attachments);
  const query =
    hasAttachmentList && attachmentIndex !== undefined
      ? `?attachment_index=${attachmentIndex}`
      : "";
  const copyImageUrl = `${API_URL}/messages/${entry.id}/copy-image${query}`;

  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": loadImageAsPngBlob(copyImageUrl) }),
  ]);
}

export async function copyMessageToClipboard(entry: ChatMessage) {
  if (canCopyImageMessage(entry)) {
    await copyMessageImageToClipboard(entry);
    return;
  }

  if (entry.content) {
    await navigator.clipboard.writeText(entry.content);
    return;
  }

  throw new Error("This message has nothing copyable.");
}

export function getUploadedFileName(entry: ChatMessage) {
  return getMessageAttachments(entry)[0]?.original_name ?? "Download file";
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
