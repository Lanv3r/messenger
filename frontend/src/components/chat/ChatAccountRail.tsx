import { ContactRound, LogOut, Moon, Sun } from "lucide-react";

import type { AuthUser, ThemeMode } from "@/types";

type ChatAccountRailProps = {
  user: AuthUser;
  themeMode: ThemeMode;
  contactsOpen: boolean;
  onToggleProfileEditor: () => void;
  onToggleContacts: () => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

export function ChatAccountRail({
  user,
  themeMode,
  contactsOpen,
  onToggleProfileEditor,
  onToggleContacts,
  onSignOut,
  onToggleTheme,
}: ChatAccountRailProps) {
  return (
    <aside className="chat-account-rail" aria-label="Account actions">
      <button
        type="button"
        className="account-rail-avatar-button"
        aria-label="Edit profile"
        title="Edit profile"
        onClick={onToggleProfileEditor}
      >
        <img
          src={user.avatarUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.src = "/favicon.svg";
          }}
        />
      </button>

      <button
        type="button"
        className={[
          "account-rail-button",
          contactsOpen ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Contacts"
        aria-pressed={contactsOpen}
        title="Contacts"
        onClick={onToggleContacts}
      >
        <ContactRound size={18} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="account-rail-button"
        aria-label="Sign out"
        title="Sign out"
        onClick={onSignOut}
      >
        <LogOut size={18} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="account-rail-button theme-toggle-button"
        aria-label={
          themeMode === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme"
        }
        aria-pressed={themeMode === "dark"}
        title={themeMode === "dark" ? "Light theme" : "Dark theme"}
        onClick={onToggleTheme}
      >
        {themeMode === "dark" ? (
          <Sun size={18} aria-hidden="true" />
        ) : (
          <Moon size={18} aria-hidden="true" />
        )}
      </button>
    </aside>
  );
}
