import {
  useCallback,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { apiFetch } from "@/lib/api";
import {
  mergeChatMembershipUpdate,
  upsertChat,
} from "@/lib/chat-helpers";
import type { Chat, ChatMember, UserProfile } from "@/types";

type UseChatInfoPanelOptions = {
  activeChat: Chat | undefined;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  applyLocalReadState: (chat: Chat) => Chat;
  onSessionExpired: () => void;
  onChatError: (message: string) => void;
};

export function useChatInfoPanel({
  activeChat,
  setChats,
  applyLocalReadState,
  onSessionExpired,
  onChatError,
}: UseChatInfoPanelOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberMessage, setAddMemberMessage] = useState<string | null>(null);

  const resetTransientState = useCallback(() => {
    setIsOpen(false);
    setIsAddingMember(false);
    setIsManaging(false);
    setMembers([]);
    setError(null);
    setAddMemberQuery("");
    setAddMemberError(null);
    setAddMemberMessage(null);
  }, []);

  function openAddMemberPanel() {
    setIsAddingMember(true);
    setIsManaging(false);
    setAddMemberError(null);
    setAddMemberMessage(null);
  }

  function updateAddMemberQuery(value: string) {
    setAddMemberQuery(value);
    setAddMemberError(null);
    setAddMemberMessage(null);
  }

  async function loadMembers(
    chat: Chat,
    options: { showPanel?: boolean } = {},
  ) {
    const showPanel = options.showPanel ?? true;

    setIsOpen(showPanel);
    setLoading(true);
    setError(null);
    setIsAddingMember(false);
    setIsManaging(false);

    try {
      const nextMembers = await apiFetch<ChatMember[]>(
        `/chats/${chat.id}/members`,
      );
      setMembers(nextMembers);
      return nextMembers;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load chat members.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setError(message);
      if (!showPanel) {
        onChatError(message);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function addMemberToActiveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeChat || activeChat.type !== "group") {
      return;
    }

    const username = addMemberQuery.trim();

    if (!username) {
      setAddMemberError("Enter a username to add.");
      setAddMemberMessage(null);
      return;
    }

    setAddMemberLoading(true);
    setAddMemberError(null);
    setAddMemberMessage(null);

    try {
      const profile = await apiFetch<UserProfile>(
        `/users/by-username/${encodeURIComponent(username)}`,
      );

      if (activeChat.member_ids.includes(profile.id)) {
        setAddMemberMessage(`${profile.username} is already in this chat.`);
        setAddMemberQuery("");
        return;
      }

      const updatedChat = await apiFetch<Chat>(
        `/chats/${activeChat.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            member_ids: [profile.id],
          }),
        },
      );

      setChats((current) => {
        const existingChat = current.find((chat) => chat.id === updatedChat.id);
        const mergedChat = mergeChatMembershipUpdate(
          existingChat,
          updatedChat,
        );

        return upsertChat(current, applyLocalReadState(mergedChat));
      });
      setAddMemberQuery("");
      setAddMemberMessage(`${profile.username} added to this chat.`);
      if (isOpen) {
        void loadMembers(updatedChat);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to add member.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAddMemberError(message);
    } finally {
      setAddMemberLoading(false);
    }
  }

  function handleMembersRemoved(memberIds: number[]) {
    setMembers((current) =>
      current.filter((member) => !memberIds.includes(member.user_id)),
    );
  }

  return {
    isOpen,
    members,
    setMembers,
    loading,
    error,
    isAddingMember,
    isManaging,
    addMemberQuery,
    addMemberLoading,
    addMemberError,
    addMemberMessage,
    setIsOpen,
    setError,
    setIsAddingMember,
    setIsManaging,
    setAddMemberQuery,
    resetTransientState,
    openAddMemberPanel,
    updateAddMemberQuery,
    loadMembers,
    addMemberToActiveGroup,
    handleMembersRemoved,
  };
}
