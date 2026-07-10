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
  return (
    <section
      className="profile-editor"
      role="dialog"
      aria-modal="true"
      aria-label="Edit your profile"
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
            maxLength={70}
            rows={3}
            onChange={(event) => onBioChange(event.target.value)}
          />
          <span>{bio.length}/70</span>
        </label>
        {error ? <p className="profile-error">{error}</p> : null}
        {message ? <p className="profile-success">{message}</p> : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </form>
    </section>
  );
}
