import {
  EllipsisVertical,
  Eraser,
  LogOut,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

type ChatHeaderProps = {
  title: string;
  subtitle: string;
  clickable: boolean;
  searchEnabled: boolean;
  searchActive: boolean;
  showChatMenu: boolean;
  showContactMenu: boolean;
  clearHistoryAction: boolean;
  showLeaveGroup: boolean;
  onClick: () => void;
  onSearchClick: () => void;
  onViewProfile: () => void;
  onDeleteChat: () => void;
  onLeaveGroup: () => void;
};

export function ChatHeader({
  title,
  subtitle,
  clickable,
  searchEnabled,
  searchActive,
  showChatMenu,
  showContactMenu,
  clearHistoryAction,
  showLeaveGroup,
  onClick,
  onSearchClick,
  onViewProfile,
  onDeleteChat,
  onLeaveGroup,
}: ChatHeaderProps) {
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const visibleContactMenu = showChatMenu && contactMenuOpen;

  useEffect(() => {
    if (!visibleContactMenu) {
      return undefined;
    }

    function closeContactMenu() {
      setContactMenuOpen(false);
    }

    document.addEventListener("click", closeContactMenu);
    document.addEventListener("scroll", closeContactMenu, true);

    return () => {
      document.removeEventListener("click", closeContactMenu);
      document.removeEventListener("scroll", closeContactMenu, true);
    };
  }, [visibleContactMenu]);

  return (
    <header
      className={[
        "chat-window-header",
        showChatMenu ? "has-contact-menu" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="chat-window-header-button"
        disabled={!clickable}
        onClick={onClick}
      >
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </button>
      <div className="chat-header-actions">
        <button
          type="button"
          className={[
            "chat-header-search-button",
            searchActive ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={searchActive ? "Close message search" : "Search messages"}
          aria-pressed={searchActive}
          title={searchActive ? "Close search" : "Search messages"}
          disabled={!searchEnabled}
          onClick={onSearchClick}
        >
          <Search size={18} aria-hidden="true" />
        </button>
        {showChatMenu ? (
          <div className="chat-header-contact-menu-wrap">
            <button
              type="button"
              className="chat-header-menu-button"
              aria-label="Chat options"
              aria-expanded={visibleContactMenu}
              aria-haspopup="menu"
              title="Chat options"
              onClick={(event) => {
                event.stopPropagation();
                setContactMenuOpen((current) => !current);
              }}
            >
              <EllipsisVertical size={19} aria-hidden="true" />
            </button>
            {visibleContactMenu ? (
              <div
                className="chat-header-contact-menu"
                role="menu"
                onClick={(event) => event.stopPropagation()}
              >
                {showContactMenu ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onViewProfile();
                      setContactMenuOpen(false);
                    }}
                  >
                    <UserRound size={16} aria-hidden="true" />
                    <span>View profile</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className={clearHistoryAction ? undefined : "danger"}
                  onClick={() => {
                    onDeleteChat();
                    setContactMenuOpen(false);
                  }}
                >
                  {clearHistoryAction ? (
                    <Eraser size={16} aria-hidden="true" />
                  ) : (
                    <Trash2 size={16} aria-hidden="true" />
                  )}
                  <span>
                    {clearHistoryAction ? "Clear history" : "Delete chat"}
                  </span>
                </button>
                {showLeaveGroup ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      onLeaveGroup();
                      setContactMenuOpen(false);
                    }}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    <span>Leave group</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
