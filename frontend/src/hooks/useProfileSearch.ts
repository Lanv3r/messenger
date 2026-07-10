import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/types";

type UseProfileSearchOptions = {
  onSessionExpired: () => void;
};

export function useProfileSearch({ onSessionExpired }: UseProfileSearchOptions) {
  const [query, setQueryState] = useState("");
  const [result, setResult] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const username = query.trim();

    if (!username) {
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setLoading(true);

      void (async () => {
        try {
          const profile = await apiFetch<UserProfile | null>(
            `/users/by-username/${encodeURIComponent(username)}`,
            { signal: controller.signal },
          );

          if (cancelled) {
            return;
          }

          setResult(profile);
          setError(profile ? null : "No user found.");
        } catch (requestError) {
          if (
            cancelled ||
            (requestError instanceof DOMException &&
              requestError.name === "AbortError")
          ) {
            return;
          }

          setResult(null);

          const requestMessage =
            requestError instanceof Error
              ? requestError.message
              : "Unable to find that user.";

          if (requestMessage === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setError(requestMessage);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, onSessionExpired]);

  const setQuery = (value: string) => {
    const normalizedValue = value.replace(/^@+/, "");
    const hasQuery = Boolean(normalizedValue.trim());

    setQueryState(normalizedValue);
    setResult(null);
    setError(null);
    setLoading(hasQuery);
  };

  const clearSearch = () => {
    setQueryState("");
    setResult(null);
    setError(null);
    setLoading(false);
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  return {
    query,
    result,
    error,
    loading,
    setQuery,
    setError,
    clearResult,
    clearSearch,
  };
}
