import { X } from "lucide-react";

import { AvatarUploadField } from "@/components/AvatarUploadField";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/types";

type CreateGroupPanelProps = {
  isOpen: boolean;
  title: string;
  description: string;
  avatarPreviewUrl: string;
  memberQuery: string;
  selectedMembers: UserProfile[];
  memberLoading: boolean;
  creating: boolean;
  error: string | null;
  message: string | null;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAvatarFileChange: (file: File | null) => void;
  onMemberQueryChange: (value: string) => void;
  onAddMember: () => void;
  onRemoveMember: (memberId: number) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function getProfileDisplayName(profile: UserProfile) {
  return `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`;
}

export function CreateGroupPanel({
  isOpen,
  title,
  description,
  avatarPreviewUrl,
  memberQuery,
  selectedMembers,
  memberLoading,
  creating,
  error,
  message,
  onClose,
  onTitleChange,
  onDescriptionChange,
  onAvatarFileChange,
  onMemberQueryChange,
  onAddMember,
  onRemoveMember,
  onSubmit,
}: CreateGroupPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="group-panel" aria-label="Create group chat">
      <form className="group-form" onSubmit={onSubmit}>
        <div className="group-form-header">
          <strong>Create group</strong>
          <button
            type="button"
            className="group-form-close"
            aria-label="Close create group"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <label>
          Group name
          <input
            type="text"
            value={title}
            placeholder="Weekend plans"
            onChange={(event) => onTitleChange(event.target.value)}
            required
          />
        </label>
        <label>
          Description
          <input
            type="text"
            value={description}
            placeholder="Optional"
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </label>
        <AvatarUploadField
          id="group-avatar-file"
          label="Group avatar"
          previewUrl={avatarPreviewUrl}
          helperText="Optional. PNG, JPEG, WebP, or GIF."
          onFileChange={onAvatarFileChange}
        />
        <label>
          Add members
          <span className="group-inline-form">
            <input
              type="search"
              value={memberQuery}
              placeholder="Username"
              autoComplete="off"
              onChange={(event) => onMemberQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddMember();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={memberLoading}
              onClick={onAddMember}
            >
              {memberLoading ? "Adding..." : "Add"}
            </Button>
          </span>
        </label>
        <p className="group-hint">
          Leave members empty to create a group with only yourself.
        </p>
        {selectedMembers.length > 0 ? (
          <div className="selected-members">
            {selectedMembers.map((member) => (
              <span className="selected-member" key={member.id}>
                <span>
                  {getProfileDisplayName(member)}
                  <small>@{member.username}</small>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveMember(member.id)}
                >
                  Remove
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {error ? <p className="profile-error">{error}</p> : null}
        {message ? <p className="profile-success">{message}</p> : null}
        <Button type="submit" disabled={creating}>
          {creating ? "Creating..." : "Create group"}
        </Button>
      </form>
    </section>
  );
}
