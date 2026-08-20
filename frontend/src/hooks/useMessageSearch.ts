import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { MessageSearchResult } from "@/types";

type UseMessageSearchOptions = {
  activeChatId: number | null;
  onSessionExpired: () => void;
};

export function useMessageSearch({
  activeChatId,
  onSessionExpired,
}: UseMessageSearchOptions) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeResultId, setActiveResultId] = useState<number | null>(null);

  const clearSearchState = useCallback(() => {
    setResults([]);
    setError(null);
    setLoading(false);
    setHasSearched(false);
    setActiveResultId(null);
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    clearSearchState();
  }, [clearSearchState]);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (activeChatId === null || !trimmedQuery) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      setHasSearched(true);

      apiFetch<MessageSearchResult[]>(
        `/chats/${activeChatId}/messages/search?query=${encodeURIComponent(trimmedQuery)}`,
        {
          signal: controller.signal,
        },
      )
        .then((searchResults) => {
          setResults(searchResults);
        })
        .catch((requestError) => {
          if (
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          ) {
            return;
          }

          setResults([]);

          const requestMessage =
            requestError instanceof Error
              ? requestError.message
              : "Unable to search messages.";

          if (requestMessage === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setError(requestMessage);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeChatId, onSessionExpired, query]);

  return {
    query,
    results,
    loading,
    error,
    hasSearched,
    activeResultId,
    setQuery,
    setResults,
    setActiveResultId,
    clearSearchState,
    reset,
  };
}
