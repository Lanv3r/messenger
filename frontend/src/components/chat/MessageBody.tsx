import {
  formatFileSize,
  formatVoiceDuration,
  getUploadedFileName,
  getUploadedFileUrl,
  getVoiceAudioUrl,
  highlightSearchText,
} from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

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

  if (
    entry.message_type === "image" ||
    entry.message_type === "video" ||
    entry.message_type === "audio"
  ) {
    const fileUrl = getUploadedFileUrl(entry);
    const fileName = getUploadedFileName(entry);

    return (
      <span className="file-message">
        {entry.message_type === "image" && fileUrl ? (
          <a href={fileUrl} target="_blank" rel="noreferrer">
            <img src={fileUrl} alt={fileName} />
          </a>
        ) : null}
        {entry.message_type === "video" && fileUrl ? (
          <video controls preload="metadata" src={fileUrl} />
        ) : null}
        {entry.message_type === "audio" && fileUrl ? (
          <audio controls preload="metadata" src={fileUrl} />
        ) : null}
        {!fileUrl ? (
          <span className="file-message-missing">File unavailable</span>
        ) : null}
        {entry.content ? (
          <span className="file-message-caption">
            {renderMessageContent(entry, searchQuery, activeSearchResultId)}
          </span>
        ) : null}
      </span>
    );
  }

  if (entry.message_type === "file") {
    const fileUrl = getUploadedFileUrl(entry);
    const fileName = getUploadedFileName(entry);
    const fileSize = formatFileSize(entry.metadata?.size_bytes);

    return (
      <span className="file-message">
        <a
          className="file-message-card"
          href={fileUrl ?? undefined}
          download={fileName}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!fileUrl}
        >
          <span>{fileName}</span>
          <small>File{fileSize ? ` · ${fileSize}` : ""}</small>
        </a>
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
