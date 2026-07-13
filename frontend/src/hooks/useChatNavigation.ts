import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Socket } from "socket.io-client";

import { apiFetch } from "@/lib/api";
import { upsertChat } from "@/lib/chat-helpers";
import type { Chat, ChatMember, ChatMessage, UserProfile } from "@/types";

type LoadChatMembersOptions = {
  showPanel?: boolean;
};

type OpenChatMembersOptions = LoadChatMembersOptions & {
  openOtherProfile?: boolean;
};

type PrepareMessageScrollOptions = {
  chatId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
  scrollTop?: number | null;
};

type UseChatNavigationOptions = {
  chats: Chat[];
  activeChat: Chat | undefined;
  activeChatIdRef: MutableRefObject<number | null>;
  socketRef: MutableRefObject<Socket | null>;
  currentUserId: number;
  chatInfoOpen: boolean;
  selectedChatMember: ChatMember | null;
  isVoiceRecording: boolean;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setActiveChatId: Dispatch<SetStateAction<number | null>>;
  setDraftRecipient: Dispatch<SetStateAction<UserProfile | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesLoading: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setReplyToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setSelectedChatMember: Dispatch<SetStateAction<ChatMember | null>>;
  setChatInfoOpen: Dispatch<SetStateAction<boolean>>;
  setChatInfoError: Dispatch<SetStateAction<string | null>>;
  setChatInfoAddingMember: Dispatch<SetStateAction<boolean>>;
  setChatInfoManaging: Dispatch<SetStateAction<boolean>>;
  prepareMessageScroll: (options: PrepareMessageScrollOptions) => void;
  saveActiveChatId: (chatId: number) => void;
  restoreComposerDraft: (
    chatId: number,
    availableMessages: ChatMessage[],
    messagesLoaded?: boolean,
  ) => void;
  resetEditingState: () => void;
  closeMessageMenu: () => void;
  closeMessageActionDialog: () => void;
  stopTypingActivity: (chatId?: number | null) => void;
  stopVoiceRecording: (send: boolean) => void;
  loadChatInfoMembers: (
    chat: Chat,
    options?: LoadChatMembersOptions,
  ) => Promise<ChatMember[] | null | undefined>;
  loadMemberDefaultPermissions: (chatId: number) => void;
  clearMemberRemoval: () => void;
  clearProfileSearchResult: () => void;
  setProfileSearchError: (message: string) => void;
  applyLocalReadState: (chat: Chat) => Chat;
  onChatChange?: () => void;
  onSessionExpired: () => void;
};

export function useChatNavigation({
  chats,
  activeChat,
  activeChatIdRef,
  socketRef,
  currentUserId,
  chatInfoOpen,
  selectedChatMember,
  isVoiceRecording,
  setChats,
  setActiveChatId,
  setDraftRecipient,
  setMessages,
  setMessagesLoading,
  setMessage,
  setReplyToMessage,
  setSelectedChatMember,
  setChatInfoOpen,
  setChatInfoError,
  setChatInfoAddingMember,
  setChatInfoManaging,
  prepareMessageScroll,
  saveActiveChatId,
  restoreComposerDraft,
  resetEditingState,
  closeMessageMenu,
  closeMessageActionDialog,
  stopTypingActivity,
  stopVoiceRecording,
  loadChatInfoMembers,
  loadMemberDefaultPermissions,
  clearMemberRemoval,
  clearProfileSearchResult,
  setProfileSearchError,
  applyLocalReadState,
  onChatChange,
  onSessionExpired,
}: UseChatNavigationOptions) {
  function joinChat(chat: Chat) {
    const socket = socketRef.current;
    const chatId = chat.id;

    stopTypingActivity();
    onChatChange?.();
    if (isVoiceRecording) {
      stopVoiceRecording(false);
    }
    if (socket && activeChatIdRef.current !== null) {
      socket.emit("leave_room", String(activeChatIdRef.current));
    }
    socket?.emit("join_room", String(chatId));
    prepareMessageScroll({
      chatId,
      lastReadMessageId: chat.current_last_read_message_id,
      unreadCount: chat.unread_count,
    });
    activeChatIdRef.current = chatId;
    saveActiveChatId(chatId);
    setActiveChatId(chatId);
    setDraftRecipient(null);
    setMessagesLoading(true);
    setMessages([]);
    restoreComposerDraft(chatId, []);
    resetEditingState();
    closeMessageMenu();
    closeMessageActionDialog();
  }

  async function loadChatMembers(
    chat: Chat,
    options: OpenChatMembersOptions = {},
  ) {
    clearMemberRemoval();
    setSelectedChatMember(null);

    const members = await loadChatInfoMembers(chat, {
      showPanel: options.showPanel,
    });

    if (!members) {
      return;
    }

    if (chat.type === "group") {
      loadMemberDefaultPermissions(chat.id);
    }

    if (options.openOtherProfile) {
      setSelectedChatMember(
        members.find((member) => member.user_id !== currentUserId) ??
          members[0] ??
          null,
      );
    }
  }

  function handleChatHeaderClick() {
    if (!activeChat || activeChat.type === "self") {
      return;
    }

    if (selectedChatMember) {
      setSelectedChatMember(null);
      return;
    }

    if (activeChat.type === "direct") {
      void loadChatMembers(activeChat, {
        showPanel: false,
        openOtherProfile: true,
      });
      return;
    }

    if (chatInfoOpen) {
      setChatInfoOpen(false);
      setChatInfoError(null);
      setChatInfoAddingMember(false);
      setChatInfoManaging(false);
      return;
    }

    void loadChatMembers(activeChat, { showPanel: true });
  }

  async function openDraftChat(profile: UserProfile) {
    const existingDirectChat = chats.find(
      (chat) => chat.type === "direct" && chat.other_user_id === profile.id,
    );

    if (existingDirectChat) {
      if (activeChatIdRef.current !== existingDirectChat.id) {
        joinChat(existingDirectChat);
      }
      clearProfileSearchResult();
      return;
    }

    try {
      const serverDirectChat = await apiFetch<Chat | null>(
        `/chats/direct/by-user/${profile.id}`,
      );

      if (serverDirectChat) {
        const resolvedChat = applyLocalReadState(serverDirectChat);
        setChats((current) => upsertChat(current, resolvedChat));
        if (activeChatIdRef.current !== resolvedChat.id) {
          joinChat(resolvedChat);
        }
        clearProfileSearchResult();
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to check existing chat.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setProfileSearchError(message);
      return;
    }

    const socket = socketRef.current;

    onChatChange?.();
    if (activeChatIdRef.current !== null) {
      socket?.emit("leave_room", String(activeChatIdRef.current));
    }

    activeChatIdRef.current = null;
    setActiveChatId(null);
    setDraftRecipient(profile);
    setMessagesLoading(false);
    setMessages([]);
    setMessage("");
    setReplyToMessage(null);
    resetEditingState();
    closeMessageMenu();
    closeMessageActionDialog();
  }

  return {
    joinChat,
    loadChatMembers,
    handleChatHeaderClick,
    openDraftChat,
  };
}
