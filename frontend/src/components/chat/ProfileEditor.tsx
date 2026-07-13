import { useState } from "react";

import { X } from "lucide-react";

import { AvatarUploadField } from "@/components/AvatarUploadField";
import { Button } from "@/components/ui/button";

type ProfileEditorProps = {
  username: string;
  firstName: string;
  lastName: string;
  bio: string;
  avatarPreviewUrl: string;
  saving: boolean;
  error: string | null;
  message: string | null;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onAvatarFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
};

const BIO_MAX_LENGTH = 70;
const BIO_LIMIT_IGNORED_KEYS = new Set([
  "Alt",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "CapsLock",
  "Control",
  "Delete",
  "End",
  "Escape",
  "Home",
  "Meta",
  "PageDown",
  "PageUp",
  "Shift",
  "Tab",
]);

function isBioLimitInputAttempt(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
) {
  if (event.metaKey || event.ctrlKey || BIO_LIMIT_IGNORED_KEYS.has(event.key)) {
    return false;
  }

  return event.key.length === 1 || event.key === "Enter";
}

export function ProfileEditor({
  username,
  firstName,
  lastName,
  bio,
  avatarPreviewUrl,
  saving,
  error,
  message,
  onFirstNameChange,
  onLastNameChange,
  onBioChange,
  onAvatarFileChange,
  onClose,
  onSubmit,
}: ProfileEditorProps) {
  const [bioLimitPulseKey, setBioLimitPulseKey] = useState(0);
  const bioLimitReached = bio.length >= BIO_MAX_LENGTH;

  function pulseBioLimit() {
    setBioLimitPulseKey((current) => current + 1);
  }

  return (
    <section
      className="profile-editor"
      role="dialog"
      aria-modal="true"
      aria-label="Edit your profile"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="profile-editor-header">
        <span>
          <AvatarUploadField
            id="profile-avatar-file"
            label="Change avatar"
            previewUrl={avatarPreviewUrl}
            variant="avatar"
            onFileChange={onAvatarFileChange}
          />
          <p>@{username}</p>
        </span>
        <button
          type="button"
          className="profile-editor-close"
          aria-label="Close profile editor"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <form className="profile-editor-form subtle-scrollbar" onSubmit={onSubmit}>
        <label>
          First name
          <input
            type="text"
            value={firstName}
            maxLength={64}
            onChange={(event) => onFirstNameChange(event.target.value)}
            required
          />
        </label>
        <label>
          Last name
          <input
            type="text"
            value={lastName}
            maxLength={64}
            onChange={(event) => onLastNameChange(event.target.value)}
          />
        </label>
        <label>
          Bio
          <textarea
            value={bio}
            maxLength={BIO_MAX_LENGTH}
            rows={3}
            onChange={(event) => onBioChange(event.target.value)}
            onKeyDown={(event) => {
              if (bioLimitReached && isBioLimitInputAttempt(event)) {
                pulseBioLimit();
              }
            }}
            onPaste={(event) => {
              if (
                bioLimitReached &&
                event.clipboardData.getData("text").length > 0
              ) {
                pulseBioLimit();
              }
            }}
          />
          <span
            key={bioLimitPulseKey}
            className={[
              bioLimitReached ? "limit-reached" : "",
              bioLimitPulseKey > 0 ? "limit-pulse" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {bio.length}/{BIO_MAX_LENGTH}
          </span>
        </label>
        {error ? <p className="profile-error">{error}</p> : null}
        {message ? <p className="profile-success">{message}</p> : null}
        <Button type="submit" className="profile-editor-save" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </form>
    </section>
  );
}
