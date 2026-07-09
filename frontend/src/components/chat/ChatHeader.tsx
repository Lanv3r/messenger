type ChatHeaderProps = {
  title: string;
  subtitle: string;
  avatarUrl: string;
  clickable: boolean;
  onClick: () => void;
};

export function ChatHeader({
  title,
  subtitle,
  avatarUrl,
  clickable,
  onClick,
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
    </header>
  );
}
