import { useState, type FormEvent } from "react";

import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/types";

type UseProfileSearchOptions = {
  onSessionExpired: () => void;
};

export function useProfileSearch({ onSessionExpired }: UseProfileSearchOptions) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();

    const username = query.trim();

    if (!username) {
      setResult(null);
      setError("Enter a username to search.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profile = await apiFetch<UserProfile>(
        `/users/by-username/${encodeURIComponent(username)}`,
      );

      setResult(profile);
    } catch (requestError) {
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
      setLoading(false);
    }
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
    search,
  };
}
