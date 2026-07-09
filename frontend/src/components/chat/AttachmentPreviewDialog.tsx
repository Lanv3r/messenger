import { Paperclip } from "lucide-react";

import { formatFileSize } from "@/lib/message-helpers";
import type { AttachmentDraft } from "@/types";

type AttachmentPreviewDialogProps = {
  drafts: AttachmentDraft[];
  caption: string;
  error: string | null;
  sending: boolean;
  onCaptionChange: (value: string) => void;
  onRemoveDraft: (draftId: string) => void;
  onAddMore: () => void;
  onCancel: () => void;
  onSend: () => void;
};

function getAttachmentLabel(messageType: string) {
  if (messageType === "image") {
    return "Photo";
  }

  if (messageType === "video") {
    return "Video";
  }

  if (messageType === "audio") {
    return "Audio file";
  }

  return "File";
}

export function AttachmentPreviewDialog({
  drafts,
  caption,
  error,
  sending,
  onCaptionChange,
  onRemoveDraft,
  onAddMore,
  onCancel,
  onSend,
}: AttachmentPreviewDialogProps) {
  return (
    <div className="message-action-backdrop" role="presentation">
      <section
        className="attachment-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Attachment preview"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="attachment-preview-header">
          <div>
            <strong>Send attachments</strong>
            <span>
              {drafts.length} {drafts.length === 1 ? "file" : "files"} selected
            </span>
          </div>
          <button
            type="button"
            aria-label="Cancel attachments"
            disabled={sending}
            onClick={onCancel}
          >
            &times;
          </button>
        </div>

        <div className="attachment-preview-list">
          {drafts.map((draft) => (
            <article className="attachment-preview-item" key={draft.id}>
              <div className="attachment-preview-media">
                {draft.messageType === "image" ? (
                  <img src={draft.previewUrl} alt={draft.file.name} />
                ) : null}
                {draft.messageType === "video" ? (
                  <video controls preload="metadata" src={draft.previewUrl} />
                ) : null}
                {draft.messageType === "audio" ||
                draft.messageType === "file" ? (
                  <span className="attachment-preview-file-icon">
                    <Paperclip size={22} aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              <div className="attachment-preview-copy">
                <strong>{draft.file.name}</strong>
                <span>
                  {getAttachmentLabel(draft.messageType)}
                  {formatFileSize(draft.file.size)
                    ? ` · ${formatFileSize(draft.file.size)}`
                    : ""}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Remove ${draft.file.name}`}
                disabled={sending}
                onClick={() => onRemoveDraft(draft.id)}
              >
                &times;
              </button>
            </article>
          ))}
        </div>

        <label className="attachment-caption-field">
          Caption
          <textarea
            value={caption}
            maxLength={4000}
            rows={3}
            placeholder="Add a caption..."
            disabled={sending}
            onChange={(event) => onCaptionChange(event.target.value)}
          />
        </label>

        {error ? <p className="profile-error">{error}</p> : null}

        <div className="message-action-dialog-actions">
          <button type="button" disabled={sending} onClick={onAddMore}>
            Add more
          </button>
          <button type="button" disabled={sending} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={sending || drafts.length === 0} onClick={onSend}>
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </section>
    </div>
  );
}
