import { EllipsisVertical, Search } from "lucide-react";
import { useEffect, useState } from "react";

type ChatHeaderProps = {
  title: string;
  subtitle: string;
  avatarUrl: string;
  clickable: boolean;
  searchEnabled: boolean;
  searchActive: boolean;
  showContactMenu: boolean;
  isContact: boolean;
  contactActionLoading: boolean;
  onClick: () => void;
  onSearchClick: () => void;
  onToggleContact: () => void;
};

export function ChatHeader({
  title,
  subtitle,
  avatarUrl,
  clickable,
  searchEnabled,
  searchActive,
  showContactMenu,
  isContact,
  contactActionLoading,
  onClick,
  onSearchClick,
  onToggleContact,
}: ChatHeaderProps) {
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const visibleContactMenu = showContactMenu && contactMenuOpen;

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
        showContactMenu ? "has-contact-menu" : "",
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
        <img
          src={avatarUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.src = "/favicon.svg";
          }}
        />
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
        {showContactMenu ? (
          <div className="chat-header-contact-menu-wrap">
            <button
              type="button"
              className="chat-header-menu-button"
              aria-label="Contact options"
              aria-expanded={visibleContactMenu}
              aria-haspopup="menu"
              title="Contact options"
              onClick={() => setContactMenuOpen((current) => !current)}
            >
              <EllipsisVertical size={19} aria-hidden="true" />
            </button>
            {visibleContactMenu ? (
              <div className="chat-header-contact-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={contactActionLoading}
                  onClick={() => {
                    onToggleContact();
                    setContactMenuOpen(false);
                  }}
                >
                  {isContact ? "Delete contact" : "Add contact"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
