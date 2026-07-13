import { MessageCircle } from "lucide-react";

import { getAssetUrl } from "@/lib/message-helpers";
import type { UserProfile } from "@/types";

type UserProfileDialogProps = {
  profile: UserProfile;
  isContact: boolean;
  contactActionLoading: boolean;
  onClose: () => void;
  onMessage: () => void;
  onToggleContact: () => void;
};

function getProfileDisplayName(profile: UserProfile) {
  return `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`;
}

export function UserProfileDialog({
  profile,
  isContact,
  contactActionLoading,
  onClose,
  onMessage,
  onToggleContact,
}: UserProfileDialogProps) {
  return (
    <div className="profile-card-backdrop" role="presentation" onClick={onClose}>
      <article
        className="profile-popup-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${getProfileDisplayName(profile)} profile`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="profile-popup-close"
          aria-label="Close profile"
          onClick={onClose}
        >
          &times;
        </button>
        <img
          src={getAssetUrl(profile.avatar_url)}
          alt=""
          onError={(event) => {
            event.currentTarget.src = "/favicon.svg";
          }}
        />
        <div>
          <h2>{getProfileDisplayName(profile)}</h2>
          <p className="profile-username">@{profile.username}</p>
          {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
          <span className="profile-status">{profile.status}</span>
          <div className="profile-user-actions">
            <button
              type="button"
              className="profile-message-button"
              onClick={onMessage}
            >
              <MessageCircle size={16} aria-hidden="true" />
              Message
            </button>
            <button
              type="button"
              className="profile-contact-button"
              disabled={contactActionLoading}
              onClick={onToggleContact}
            >
              {isContact ? "Delete contact" : "Add contact"}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
