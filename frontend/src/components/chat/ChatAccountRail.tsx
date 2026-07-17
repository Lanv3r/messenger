import {
  Bell,
  BellOff,
  ContactRound,
  LogOut,
  MessagesSquare,
  Moon,
  Sun,
} from "lucide-react";

import type { AuthUser, ThemeMode } from "@/types";

type ChatAccountRailProps = {
  user: AuthUser;
  themeMode: ThemeMode;
  chatsActive: boolean;
  contactsOpen: boolean;
  notificationsPermission: NotificationPermission | "unsupported";
  notificationsEnabled: boolean;
  onToggleProfileEditor: () => void;
  onOpenChats: () => void;
  onToggleContacts: () => void;
  onToggleNotifications: () => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
};

export function ChatAccountRail({
  user,
  themeMode,
  chatsActive,
  contactsOpen,
  notificationsPermission,
  notificationsEnabled,
  onToggleProfileEditor,
  onOpenChats,
  onToggleContacts,
  onToggleNotifications,
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
          chatsActive ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Chats"
        aria-pressed={chatsActive}
        title="Chats"
        onClick={onOpenChats}
      >
        <MessagesSquare size={18} aria-hidden="true" />
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

      <div className="account-rail-bottom-actions">
        {notificationsPermission !== "unsupported" ? (
          <button
            type="button"
            className={[
              "account-rail-button",
              notificationsEnabled ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={
              notificationsPermission === "denied"
                ? "Browser notifications are blocked"
                : notificationsEnabled
                  ? "Disable browser notifications"
                  : "Enable browser notifications"
            }
            aria-pressed={notificationsEnabled}
            title={
              notificationsPermission === "denied"
                ? "Browser notifications are blocked"
                : notificationsEnabled
                  ? "Disable notifications"
                  : "Enable notifications"
            }
            disabled={notificationsPermission === "denied"}
            onClick={onToggleNotifications}
          >
            {notificationsEnabled ? (
              <Bell size={18} aria-hidden="true" />
            ) : (
              <BellOff size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}

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
      </div>
    </aside>
  );
}
