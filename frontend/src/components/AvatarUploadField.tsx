import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImagePreviewDialog } from "@/components/chat/ImagePreviewDialog";
import { getAssetUrl } from "@/lib/message-helpers";

type AvatarUploadFieldProps = {
  id: string;
  label: string;
  previewUrl: string;
  helperText?: string;
  variant?: "field" | "avatar";
  onFileChange: (file: File | null) => void;
};

export function AvatarUploadField({
  id,
  label,
  previewUrl,
  helperText = "PNG, JPEG, WebP, or GIF.",
  variant = "field",
  onFileChange,
}: AvatarUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [viewingAvatar, setViewingAvatar] = useState(false);

  const clearNativeInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const closePreview = () => {
    if (pendingPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingFile(null);
    setPendingPreviewUrl(null);
    clearNativeInput();
  };

  const acceptPreview = () => {
    onFileChange(pendingFile);
    closePreview();
  };

  const openFilePicker = () => inputRef.current?.click();

  const input = (
    <input
      ref={inputRef}
      id={id}
      className="avatar-upload-native-input"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      onChange={(event) => {
        if (pendingPreviewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(pendingPreviewUrl);
        }

        const file = event.target.files?.[0] ?? null;
        setPendingFile(file);
        setPendingPreviewUrl(file ? URL.createObjectURL(file) : null);
      }}
    />
  );

  const dialog =
    pendingFile && pendingPreviewUrl ? (
      <div className="avatar-upload-backdrop" role="presentation">
        <section
          className="avatar-upload-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm avatar image"
        >
          <button
            type="button"
            className="avatar-upload-dialog-close"
            aria-label="Cancel avatar upload"
            onClick={closePreview}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <img src={pendingPreviewUrl} alt="" />
          <div>
            <strong>Use this image?</strong>
            <span>{pendingFile.name}</span>
          </div>
          <div className="avatar-upload-dialog-actions">
            <Button
              type="button"
              variant="outline"
              className="text-action-button"
              onClick={closePreview}
            >
              Cancel
            </Button>
            <Button type="button" onClick={acceptPreview}>
              Yes
            </Button>
          </div>
        </section>
      </div>
    ) : null;

  if (variant === "avatar") {
    const avatarUrl = getAssetUrl(previewUrl);

    return (
      <>
        <span className="avatar-upload-avatar-trigger">
          {input}
          <button
            type="button"
            className="avatar-upload-avatar-button"
            aria-label="View avatar"
            title="View avatar"
            onClick={() => setViewingAvatar(true)}
          >
            <img
              src={avatarUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.src = "/favicon.svg";
              }}
            />
          </button>
          <button
            type="button"
            className="avatar-upload-avatar-change"
            aria-label={label}
            title={label}
            onClick={openFilePicker}
          >
            <ImagePlus size={14} aria-hidden="true" />
            Change
          </button>
        </span>
        {dialog}
        {viewingAvatar ? (
          <ImagePreviewDialog
            src={avatarUrl}
            alt="Profile avatar"
            onClose={() => setViewingAvatar(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="avatar-upload-field">
      <span className="avatar-upload-label">{label}</span>
      <div className="avatar-upload-control">
        <img
          src={getAssetUrl(previewUrl)}
          alt=""
          className="avatar-upload-preview"
          onError={(event) => {
            event.currentTarget.src = "/favicon.svg";
          }}
        />
        {input}
        <button
          type="button"
          className="avatar-upload-button"
          onClick={openFilePicker}
        >
          <ImagePlus size={16} aria-hidden="true" />
          Choose image
        </button>
      </div>
      <span className="avatar-upload-help">{helperText}</span>
      {dialog}
    </div>
  );
}
