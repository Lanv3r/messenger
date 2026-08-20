import { X } from "lucide-react";

import { formatMessageTime } from "@/lib/date-format";
import { getSearchExcerpt, highlightSearchText } from "@/lib/message-helpers";
import { keepSubtleScrollbarVisible } from "@/lib/scrollbar";
import type { MessageSearchResult } from "@/types";

type MessageSearchProps = {
  activeChatId: number | null;
  query: string;
  results: MessageSearchResult[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  activeResultId: number | null;
  autoFocus?: boolean;
  onQueryChange: (value: string) => void;
  onClearSearchState: () => void;
  onCloseSearch?: () => void;
  onRevealResult: (entry: MessageSearchResult) => void;
  getSenderName: (entry: MessageSearchResult) => string;
};

export function MessageSearch({
  activeChatId,
  query,
  results,
  loading,
  error,
  hasSearched,
  activeResultId,
  autoFocus = false,
  onQueryChange,
  onClearSearchState,
  onCloseSearch,
  onRevealResult,
  getSenderName,
}: MessageSearchProps) {
  return (
    <section
      className={[
        "message-search",
        onCloseSearch ? "sidebar-message-search" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Search messages"
    >
      <form
        className="message-search-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          type="search"
          value={query}
          placeholder="Search in this chat"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={activeChatId === null}
          onChange={(event) => {
            const value = event.target.value;
            onQueryChange(value);
            onClearSearchState();
          }}
        />
        {onCloseSearch ? (
          <button
            type="button"
            className="message-search-close"
            aria-label="Close message search"
            onClick={onCloseSearch}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </form>

      {error ? <p className="profile-error">{error}</p> : null}

      {loading ? <p className="message-search-empty">Searching...</p> : null}

      {results.length > 0 ? (
        <div
          className="message-search-results subtle-scrollbar"
          onScroll={keepSubtleScrollbarVisible}
        >
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className={result.id === activeResultId ? "active" : undefined}
              onClick={() => onRevealResult(result)}
            >
              <span>
                <strong>{getSenderName(result)}</strong>
                {result.created_at ? (
                  <time dateTime={result.created_at}>
                    {formatMessageTime(result.created_at)}
                  </time>
                ) : null}
              </span>
              <small>
                {highlightSearchText(
                  getSearchExcerpt(result.content, query),
                  query,
                )}
              </small>
            </button>
          ))}
        </div>
      ) : null}

      {hasSearched && !loading && !error && results.length === 0 ? (
        <p className="message-search-empty">No matching messages.</p>
      ) : null}
    </section>
  );
}
