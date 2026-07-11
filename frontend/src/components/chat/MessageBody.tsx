import {
  formatFileSize,
  formatVoiceDuration,
  getAttachmentFileUrl,
  getMessageAttachments,
  getUploadedFileName,
  getVoiceAudioUrl,
  highlightSearchText,
} from "@/lib/message-helpers";
import type { ChatMessage, MessageAttachment } from "@/types";

type MessageBodyProps = {
  entry: ChatMessage;
  searchQuery: string;
  activeSearchResultId: number | null;
};

function renderMessageContent(
  entry: ChatMessage,
  searchQuery: string,
  activeSearchResultId: number | null,
) {
  const content = entry.content ?? "";
  const query = searchQuery.trim();

  if (!query || entry.id !== activeSearchResultId) {
    return content;
  }

  return highlightSearchText(content, query);
}

export function MessageBody({
  entry,
  searchQuery,
  activeSearchResultId,
}: MessageBodyProps) {
  if (entry.message_type === "voice") {
    const audioUrl = getVoiceAudioUrl(entry);
    const durationMs =
      typeof entry.metadata?.duration_ms === "number"
        ? entry.metadata.duration_ms
        : 0;

    return (
      <span className="voice-message">
        <span className="voice-message-label">
          Voice message
          {durationMs > 0 ? ` · ${formatVoiceDuration(durationMs)}` : ""}
        </span>
        {audioUrl ? (
          <audio controls preload="metadata" src={audioUrl} />
        ) : (
          <span className="voice-message-missing">Audio unavailable</span>
        )}
      </span>
    );
  }

  const attachments = getMessageAttachments(entry);
  if (attachments.length > 0) {
    const usesMediaGrid =
      attachments.length > 1 &&
      attachments.every(
        (attachment) =>
          attachment.message_type === "image" ||
          attachment.message_type === "video",
      );

    function renderAttachment(attachment: MessageAttachment, index: number) {
      const fileUrl = getAttachmentFileUrl(attachment);
      const fileName = attachment.original_name || getUploadedFileName(entry);
      const fileSize = formatFileSize(attachment.size_bytes);

      if (attachment.message_type === "image") {
        return fileUrl ? (
          <a href={fileUrl} target="_blank" rel="noreferrer">
            <img src={fileUrl} alt={fileName} />
          </a>
        ) : (
          <span className="file-message-missing">File unavailable</span>
        );
      }

      if (attachment.message_type === "video") {
        return fileUrl ? (
          <video controls preload="metadata" src={fileUrl} />
        ) : (
          <span className="file-message-missing">File unavailable</span>
        );
      }

      if (attachment.message_type === "audio") {
        return fileUrl ? (
          <audio controls preload="metadata" src={fileUrl} />
        ) : (
          <span className="file-message-missing">File unavailable</span>
        );
      }

      return (
        <a
          className="file-message-card"
          href={fileUrl}
          download={fileName}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!fileUrl}
        >
          <span>{fileName || `Attachment ${index + 1}`}</span>
          <small>File{fileSize ? ` · ${fileSize}` : ""}</small>
        </a>
      );
    }

    return (
      <span className="file-message">
        <span
          className={[
            "file-message-attachments",
            usesMediaGrid ? "multiple" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {attachments.map((attachment, index) => (
            <span
              className={[
                "file-message-attachment",
                attachment.message_type,
              ].join(" ")}
              key={`${attachment.file_url}-${index}`}
            >
              {renderAttachment(attachment, index)}
            </span>
          ))}
        </span>
        {entry.content ? (
          <span className="file-message-caption">
            {renderMessageContent(entry, searchQuery, activeSearchResultId)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span>{renderMessageContent(entry, searchQuery, activeSearchResultId)}</span>
  );
}
