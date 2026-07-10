import { Search } from "lucide-react";

type ChatHeaderProps = {
  title: string;
  subtitle: string;
  avatarUrl: string;
  clickable: boolean;
  searchEnabled: boolean;
  searchActive: boolean;
  onClick: () => void;
  onSearchClick: () => void;
};

export function ChatHeader({
  title,
  subtitle,
  avatarUrl,
  clickable,
  searchEnabled,
  searchActive,
  onClick,
  onSearchClick,
}: ChatHeaderProps) {
  return (
    <header className="chat-window-header">
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
    </header>
  );
}
