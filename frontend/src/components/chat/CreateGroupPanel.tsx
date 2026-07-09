import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/types";

type CreateGroupPanelProps = {
  isOpen: boolean;
  title: string;
  description: string;
  avatarUrl: string;
  memberQuery: string;
  selectedMembers: UserProfile[];
  memberLoading: boolean;
  creating: boolean;
  error: string | null;
  message: string | null;
  onOpen: () => void;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAvatarUrlChange: (value: string) => void;
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
  avatarUrl,
  memberQuery,
  selectedMembers,
  memberLoading,
  creating,
  error,
  message,
  onOpen,
  onClose,
  onTitleChange,
  onDescriptionChange,
  onAvatarUrlChange,
  onMemberQueryChange,
  onAddMember,
  onRemoveMember,
  onSubmit,
}: CreateGroupPanelProps) {
  return (
    <section className="group-panel" aria-label="Create group chat">
      {!isOpen ? (
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          New group
        </Button>
      ) : (
        <form className="group-form" onSubmit={onSubmit}>
          <div className="group-form-header">
            <strong>Create group</strong>
            <button type="button" onClick={onClose}>
              Close
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
          <label>
            Avatar URL
            <input
              type="text"
              value={avatarUrl}
              placeholder="/favicon.svg"
              onChange={(event) => onAvatarUrlChange(event.target.value)}
            />
          </label>
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
      )}
    </section>
  );
}
