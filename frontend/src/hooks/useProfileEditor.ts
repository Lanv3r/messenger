import { useEffect, useState, type FormEvent } from "react";

import { apiFetch } from "@/lib/api";
import type { AuthResponse, AuthUser } from "@/types";

type UseProfileEditorOptions = {
  user: AuthUser;
  onUserUpdated: (user: AuthResponse) => void;
  onSessionExpired: () => void;
};

export function useProfileEditor({
  user,
  onUserUpdated,
  onSessionExpired,
}: UseProfileEditorOptions) {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      return;
    }

    setFirstName(user.firstName);
    setLastName(user.lastName ?? "");
    setBio(user.bio ?? "");
    setAvatarUrl(user.avatarUrl);
  }, [editing, user.avatarUrl, user.bio, user.firstName, user.lastName]);

  const toggleEditing = () => {
    setEditing((current) => !current);
    setError(null);
    setMessage(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!firstName.trim()) {
      setMessage(null);
      setError("First name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updatedUser = await apiFetch<AuthResponse>("/users/me/", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || "/favicon.svg",
        }),
      });

      onUserUpdated(updatedUser);
      setMessage("Profile updated.");
      setEditing(false);
    } catch (requestError) {
      const requestMessage =
        requestError instanceof Error
          ? requestError.message
          : "Unable to update profile.";

      if (requestMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setError(requestMessage);
    } finally {
      setSaving(false);
    }
  };

  return {
    editing,
    firstName,
    lastName,
    bio,
    avatarUrl,
    error,
    message,
    saving,
    setFirstName,
    setLastName,
    setBio,
    setAvatarUrl,
    toggleEditing,
    submit,
  };
}
