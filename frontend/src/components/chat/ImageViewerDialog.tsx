import { useState } from "react";

import type { ChatMessage } from "@/types";

type ImageViewerDialogProps = {
  src: string;
  alt: string;
  entry: ChatMessage;
  attachmentIndex: number;
  canDelete: boolean;
  onClose: () => void;
  onGoToMessage: (entry: ChatMessage) => void;
  onCopyImage: (entry: ChatMessage, attachmentIndex: number) => void;
  onDelete: (entry: ChatMessage) => void;
};

type ViewerMenuPosition = {
  x: number;
  y: number;
};

function getViewerMenuPosition(clientX: number, clientY: number) {
  const menuWidth = 170;
  const menuMaxHeight = 170;
  const viewportPadding = 8;
  const maxX = Math.max(
    viewportPadding,
    window.innerWidth - menuWidth - viewportPadding,
  );
  const maxY = Math.max(
    viewportPadding,
    window.innerHeight - menuMaxHeight - viewportPadding,
  );

  return {
    x: Math.min(Math.max(clientX, viewportPadding), maxX),
    y: Math.min(Math.max(clientY, viewportPadding), maxY),
  };
}

export function ImageViewerDialog({
  src,
  alt,
  entry,
  attachmentIndex,
  canDelete,
  onClose,
  onGoToMessage,
  onCopyImage,
  onDelete,
}: ImageViewerDialogProps) {
  const [menuPosition, setMenuPosition] = useState<ViewerMenuPosition | null>(
    null,
  );

  return (
    <div className="image-viewer-backdrop" role="presentation" onClick={onClose}>
      <section
        className="image-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        onClick={(event) => {
          event.stopPropagation();
          setMenuPosition(null);
        }}
      >
        <img
          src={src}
          alt={alt}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuPosition(
              getViewerMenuPosition(event.clientX, event.clientY),
            );
          }}
        />
        {menuPosition ? (
          <span
            className="image-viewer-context-menu"
            role="menu"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuPosition(null);
                onGoToMessage(entry);
              }}
            >
              Go to message
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuPosition(null);
                onCopyImage(entry, attachmentIndex);
              }}
            >
              Copy Image
            </button>
            {canDelete ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuPosition(null);
                  onDelete(entry);
                }}
              >
                Delete
              </button>
            ) : null}
          </span>
        ) : null}
      </section>
    </div>
  );
}
