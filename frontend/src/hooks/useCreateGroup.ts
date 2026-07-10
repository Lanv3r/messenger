import { useState, type FormEvent } from "react";

import { apiFetch } from "@/lib/api";
import type { Chat, UserProfile } from "@/types";

type UseCreateGroupOptions = {
  currentUserId: number;
  onSessionExpired: () => void;
  onCreatedGroup: (chat: Chat) => void;
};

export function useCreateGroup({
  currentUserId,
  onSessionExpired,
  onCreatedGroup,
}: UseCreateGroupOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("/favicon.svg");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<UserProfile[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setAvatarFile(null);
    setAvatarPreviewUrl("/favicon.svg");
    setMemberQuery("");
    setSelectedMembers([]);
    setError(null);
    setMessage(null);
  };

  const updateAvatarFile = (file: File | null) => {
    setAvatarFile(file);
    if (!file) {
      setAvatarPreviewUrl("/favicon.svg");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl((current) => {
      if (current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return objectUrl;
    });
  };

  const open = () => {
    setIsOpen(true);
    setError(null);
    setMessage(null);
  };

  const close = () => {
    setIsOpen(false);
    reset();
  };

  const addSelectedMember = async () => {
    const username = memberQuery.trim();

    if (!username) {
      setError("Enter a username to add.");
      setMessage(null);
      return;
    }

    setMemberLoading(true);
    setError(null);
    setMessage(null);

    try {
      const profile = await apiFetch<UserProfile>(
        `/users/by-username/${encodeURIComponent(username)}`,
      );

      if (profile.id === currentUserId) {
        setError("You are already included in every group you create.");
        return;
      }

      if (selectedMembers.some((member) => member.id === profile.id)) {
        setError(`${profile.username} is already selected.`);
        return;
      }

      setSelectedMembers((current) => [...current, profile]);
      setMemberQuery("");
      setMessage(`${profile.username} selected.`);
    } catch (requestError) {
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
      setMemberLoading(false);
    }
  };

  const removeSelectedMember = (memberId: number) => {
    setSelectedMembers((current) =>
      current.filter((member) => member.id !== memberId),
    );
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();

    if (!title.trim()) {
      setError("Group name is required.");
      setMessage(null);
      return;
    }

    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      for (const member of selectedMembers) {
        formData.append("member_ids", String(member.id));
      }
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const createdChat = await apiFetch<Chat>("/chats/group", {
        method: "POST",
        body: formData,
      });

      onCreatedGroup(createdChat);
      setIsOpen(false);
      reset();
    } catch (requestError) {
      const requestMessage =
        requestError instanceof Error
          ? requestError.message
          : "Unable to create group.";

      if (requestMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setError(requestMessage);
    } finally {
      setCreating(false);
    }
  };

  return {
    isOpen,
    title,
    description,
    avatarPreviewUrl,
    memberQuery,
    selectedMembers,
    memberLoading,
    creating,
    error,
    message,
    setTitle,
    setDescription,
    setAvatarFile: updateAvatarFile,
    setMemberQuery,
    open,
    close,
    addSelectedMember,
    removeSelectedMember,
    create,
  };
}
