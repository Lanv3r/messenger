import { useEffect, useRef, type ClipboardEvent } from "react";
import { Paperclip } from "lucide-react";

import type { AttachmentDraft } from "@/types";

type AttachmentPreviewDialogProps = {
  drafts: AttachmentDraft[];
  caption: string;
  error: string | null;
  sending: boolean;
  onCaptionChange: (value: string) => void;
  onRemoveDraft: (draftId: string) => void;
  onPasteImages: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onAddMore: () => void;
  onCancel: () => void;
  onSend: () => void;
};

export function AttachmentPreviewDialog({
  drafts,
  caption,
  error,
  sending,
  onCaptionChange,
  onRemoveDraft,
  onPasteImages,
  onAddMore,
  onCancel,
  onSend,
}: AttachmentPreviewDialogProps) {
  const captionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = captionRef.current;
    if (!textarea) {
      return;
    }

    const style = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    const maxHeight =
      lineHeight * 7 + paddingTop + paddingBottom + borderTop + borderBottom;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";

    if (textarea.scrollHeight > maxHeight && document.activeElement === textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [caption]);

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
            <strong>Send attachments ({drafts.length} selected)</strong>
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

        <label className="attachment-caption-field" aria-label="Caption">
          <textarea
            ref={captionRef}
            value={caption}
            maxLength={4000}
            rows={1}
            placeholder="Add a caption..."
            disabled={sending}
            onChange={(event) => onCaptionChange(event.target.value)}
            onPaste={onPasteImages}
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
