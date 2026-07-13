import { ContactRound } from "lucide-react";

import { getAssetUrl } from "@/lib/message-helpers";
import { keepSubtleScrollbarVisible } from "@/lib/scrollbar";
import type { UserProfile } from "@/types";

type ContactsSidebarProps = {
  contacts: UserProfile[];
  loading: boolean;
  error: string | null;
  onOpenContact: (contact: UserProfile) => void;
};

function getContactDisplayName(contact: UserProfile) {
  return `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`;
}

export function ContactsSidebar({
  contacts,
  loading,
  error,
  onOpenContact,
}: ContactsSidebarProps) {
  return (
    <aside className="chat-sidebar contacts-sidebar" aria-label="Contacts">
      <div className="contacts-sidebar-heading">
        <div className="sidebar-section-label">Contacts</div>
        <span>{contacts.length}</span>
      </div>
      <div
        className="contacts-list subtle-scrollbar"
        onScroll={keepSubtleScrollbarVisible}
      >
        {loading ? <p className="contacts-status">Loading contacts...</p> : null}
        {error ? <p className="profile-error">{error}</p> : null}
        {!loading && !error && contacts.length === 0 ? (
          <div className="contacts-empty-state">
            <ContactRound size={22} aria-hidden="true" />
            <strong>No contacts yet</strong>
            <p>Add someone from a direct chat or their profile.</p>
          </div>
        ) : null}
        {contacts.map((contact) => (
          <button
            key={contact.id}
            type="button"
            className="contact-list-item"
            onClick={() => onOpenContact(contact)}
          >
            <img
              src={getAssetUrl(contact.avatar_url)}
              alt=""
              onError={(event) => {
                event.currentTarget.src = "/favicon.svg";
              }}
            />
            <span>
              <strong>{getContactDisplayName(contact)}</strong>
              <small>@{contact.username}</small>
              <em>{contact.status}</em>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
