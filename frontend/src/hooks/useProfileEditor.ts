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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(user.avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hasUnsavedChanges =
    firstName !== user.firstName ||
    lastName !== (user.lastName ?? "") ||
    bio !== (user.bio ?? "") ||
    avatarFile !== null;

  useEffect(() => {
    if (editing) {
      return;
    }

    setFirstName(user.firstName);
    setLastName(user.lastName ?? "");
    setBio(user.bio ?? "");
    setAvatarFile(null);
    setAvatarPreviewUrl(user.avatarUrl);
  }, [editing, user.avatarUrl, user.bio, user.firstName, user.lastName]);

  useEffect(() => {
    if (!avatarFile) {
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const toggleEditing = () => {
    setEditing((current) => !current);
    setError(null);
    setMessage(null);
  };

  const openEditing = () => {
    setEditing(true);
    setError(null);
    setMessage(null);
  };

  const closeEditing = () => {
    setEditing(false);
    setError(null);
    setMessage(null);
  };

  const saveProfile = async () => {
    if (!firstName.trim()) {
      setMessage(null);
      setError("First name is required.");
      return false;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("first_name", firstName.trim());
      formData.append("last_name", lastName.trim());
      formData.append("bio", bio.trim());
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const updatedUser = await apiFetch<AuthResponse>("/users/me/", {
        method: "PATCH",
        body: formData,
      });

      onUserUpdated(updatedUser);
      setFirstName(updatedUser.first_name);
      setLastName(updatedUser.last_name ?? "");
      setBio(updatedUser.bio ?? "");
      setAvatarFile(null);
      setAvatarPreviewUrl(updatedUser.avatar_url ?? "/favicon.svg");
      setMessage("Profile updated.");
      return true;
    } catch (requestError) {
      const requestMessage =
        requestError instanceof Error
          ? requestError.message
          : "Unable to update profile.";

      if (requestMessage === "Could not validate credentials") {
        onSessionExpired();
        return false;
      }

      setError(requestMessage);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await saveProfile();
  };

  return {
    editing,
    firstName,
    lastName,
    bio,
    avatarPreviewUrl,
    error,
    message,
    saving,
    hasUnsavedChanges,
    setFirstName,
    setLastName,
    setBio,
    setAvatarFile,
    toggleEditing,
    openEditing,
    closeEditing,
    saveProfile,
    submit,
  };
}
