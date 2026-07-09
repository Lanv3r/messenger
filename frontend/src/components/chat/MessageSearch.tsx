import { formatMessageTime } from "@/lib/date-format";
import { getSearchExcerpt, highlightSearchText } from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

type MessageSearchProps = {
  activeChatId: number | null;
  query: string;
  results: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  activeResultId: number | null;
  onQueryChange: (value: string) => void;
  onClearSearchState: () => void;
  onRevealResult: (entry: ChatMessage) => void;
  getSenderName: (entry: ChatMessage) => string;
};

export function MessageSearch({
  activeChatId,
  query,
  results,
  loading,
  error,
  hasSearched,
  activeResultId,
  onQueryChange,
  onClearSearchState,
  onRevealResult,
  getSenderName,
}: MessageSearchProps) {
  return (
    <section className="message-search" aria-label="Search messages">
      <form
        className="message-search-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          type="search"
          value={query}
          placeholder="Search in this chat"
          autoComplete="off"
          disabled={activeChatId === null}
          onChange={(event) => {
            const value = event.target.value;
            onQueryChange(value);
            onClearSearchState();
          }}
        />
      </form>

      {error ? <p className="profile-error">{error}</p> : null}

      {loading ? <p className="message-search-empty">Searching...</p> : null}

      {results.length > 0 ? (
        <div className="message-search-results">
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
