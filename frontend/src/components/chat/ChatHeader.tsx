import { EllipsisVertical, Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type ChatHeaderProps = {
  title: string;
  subtitle: string;
  avatarUrl: string;
  clickable: boolean;
  searchEnabled: boolean;
  searchActive: boolean;
  showContactMenu: boolean;
  onClick: () => void;
  onSearchClick: () => void;
  onViewProfile: () => void;
};

export function ChatHeader({
  title,
  subtitle,
  avatarUrl,
  clickable,
  searchEnabled,
  searchActive,
  showContactMenu,
  onClick,
  onSearchClick,
  onViewProfile,
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
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
