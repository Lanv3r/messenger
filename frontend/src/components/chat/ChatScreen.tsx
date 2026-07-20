import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import type { Socket } from "socket.io-client";
import { Ban } from "lucide-react";

import { AttachmentPreviewDialog } from "@/components/chat/AttachmentPreviewDialog";
import { ChatAccountRail } from "@/components/chat/ChatAccountRail";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ContactsSidebar } from "@/components/chat/ContactsSidebar";
import { CreateGroupPanel } from "@/components/chat/CreateGroupPanel";
import { DeleteChatDialog } from "@/components/chat/DeleteChatDialog";
import { GroupInfoPanel } from "@/components/chat/GroupInfoPanel";
import { ImageViewerDialog } from "@/components/chat/ImageViewerDialog";
import { LeaveGroupDialog } from "@/components/chat/LeaveGroupDialog";
import { MemberProfileDialog } from "@/components/chat/MemberProfileDialog";
import { MemberRemovalDialog } from "@/components/chat/MemberRemovalDialog";
import { MessageActionDialog } from "@/components/chat/MessageActionDialog";
import { MessageBody } from "@/components/chat/MessageBody";
import { MessageList } from "@/components/chat/MessageList";
import { MessageReplyPreviewButton } from "@/components/chat/MessageReplyPreviewButton";
import { MessageSearch } from "@/components/chat/MessageSearch";
import { PinnedMessagesBar } from "@/components/chat/PinnedMessagesBar";
import { ProfileEditor } from "@/components/chat/ProfileEditor";
import { UserProfileDialog } from "@/components/chat/UserProfileDialog";
import { apiFetch } from "@/lib/api";
import {
  getChatMemberDisplayName,
  upsertChat,
} from "@/lib/chat-helpers";
import {
  copyMessageImageToClipboard,
  copyMessageToClipboard,
  getMessageAttachments,
} from "@/lib/message-helpers";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useChatSocket } from "@/hooks/useChatSocket";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useProfileEditor } from "@/hooks/useProfileEditor";
import { useMessageSearch } from "@/hooks/useMessageSearch";
import { useProfileSearch } from "@/hooks/useProfileSearch";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import { useGroupMemberManagement } from "@/hooks/useGroupMemberManagement";
import { useAttachmentDrafts } from "@/hooks/useAttachmentDrafts";
import { useMessageActionMenu } from "@/hooks/useMessageActionMenu";
import { useMessageEditing } from "@/hooks/useMessageEditing";
import { useChatActivity } from "@/hooks/useChatActivity";
import { useMessageReadTracking } from "@/hooks/useMessageReadTracking";
import { useComposerDrafts } from "@/hooks/useComposerDrafts";
import { useChatInfoPanel } from "@/hooks/useChatInfoPanel";
import { useMessageMutations } from "@/hooks/useMessageMutations";
import { useChatSettings } from "@/hooks/useChatSettings";
import { useMessageSending } from "@/hooks/useMessageSending";
import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useMessageDisplay } from "@/hooks/useMessageDisplay";
import { useChatPresentation } from "@/hooks/useChatPresentation";
import { useChatSocketEvents } from "@/hooks/useChatSocketEvents";
import { useChatData } from "@/hooks/useChatData";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useBlocks } from "@/hooks/useBlocks";
import { useContacts } from "@/hooks/useContacts";
import { useChatPermissions } from "@/hooks/useChatPermissions";
import type {
  AuthResponse,
  AuthUser,
  Chat,
  ChatMember,
  ChatMessage,
  MessageCopyTarget,
  ThemeMode,
  UserProfile,
} from "@/types";

function toUserProfile(member: ChatMember): UserProfile {
  return {
    id: member.user_id,
    username: member.username,
    first_name: member.first_name,
    last_name: member.last_name,
    bio: member.bio,
    avatar_url: member.avatar_url,
    status: member.status,
  };
}

type ChatDeleteTarget = {
  chat: Chat;
  action: "clear" | "delete";
};

export function ChatScreen({
  user,
  themeMode,
  onToggleTheme,
  onSignOut,
  onSessionExpired,
  onUserUpdated,
}: {
  user: AuthUser;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onSessionExpired: () => void;
  onUserUpdated: (user: AuthResponse) => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<
    number | null
  >(null);
  const activeChatIdRef = useRef<number | null>(null);
  const [draftRecipient, setDraftRecipient] = useState<UserProfile | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [chatError, setChatError] = useState<string | null>(
    null,
  );
  const [profileCloseConfirmOpen, setProfileCloseConfirmOpen] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [selectedContactProfile, setSelectedContactProfile] =
    useState<UserProfile | null>(null);
  const [imageViewer, setImageViewer] = useState<{
    src: string;
    alt: string;
    entry: ChatMessage;
    attachmentIndex: number;
  } | null>(null);
  const [editingAttachmentMessage, setEditingAttachmentMessage] =
    useState<ChatMessage | null>(null);
  const [attachmentEditSaving, setAttachmentEditSaving] = useState(false);
  const [chatDeleteTarget, setChatDeleteTarget] =
    useState<ChatDeleteTarget | null>(null);
  const [deleteChatMessagesForEveryone, setDeleteChatMessagesForEveryone] =
    useState(false);
  const [chatDeleting, setChatDeleting] = useState(false);
  const [groupLeaveTarget, setGroupLeaveTarget] = useState<Chat | null>(null);
  const [groupLeaving, setGroupLeaving] = useState(false);
  const searchHighlightTimeoutRef = useRef<number | null>(null);
  const {
    drafts: attachmentDrafts,
    caption: attachmentCaption,
    error: attachmentError,
    setCaption: setAttachmentCaption,
    setError: setAttachmentError,
    clearDrafts: clearAttachmentDrafts,
    removeDraft: removeAttachmentDraft,
    addDrafts: addAttachmentDrafts,
    setDraftsFromAttachments,
    handleFileInputChange,
  } = useAttachmentDrafts({
    activeChatId,
    hasDraftRecipient: draftRecipient !== null,
    onChatError: setChatError,
    onClearChatError: () => setChatError(null),
  });
  const {
    query: profileQuery,
    result: profileResult,
    error: profileError,
    loading: profileLoading,
    setQuery: setProfileQuery,
    setError: setProfileSearchError,
    clearResult: clearProfileSearchResult,
    clearSearch: clearProfileSearch,
  } = useProfileSearch({ onSessionExpired });
  const {
    contacts,
    loading: contactsLoading,
    error: contactsError,
    savingUserId: contactSavingUserId,
    isContact,
    toggleContact,
    refreshContacts,
  } = useContacts({ onSessionExpired });
  const {
    isBlocked,
    blockingUserId,
    toggleBlock,
  } = useBlocks({ onSessionExpired });
  const {
    editing: editingProfile,
    firstName: profileFirstName,
    lastName: profileLastName,
    bio: profileBio,
    avatarPreviewUrl: profileAvatarPreviewUrl,
    error: profileSaveError,
    message: profileSaveMessage,
    saving: profileSaving,
    hasUnsavedChanges: profileHasUnsavedChanges,
    setFirstName: setProfileFirstName,
    setLastName: setProfileLastName,
    setBio: setProfileBio,
    setAvatarFile: setProfileAvatarFile,
    openEditing: openProfileEditor,
    closeEditing: closeProfileEditor,
    saveProfile,
    submit: handleProfileUpdate,
  } = useProfileEditor({
    user,
    onUserUpdated,
    onSessionExpired,
  });
  const requestCloseProfileEditor = () => {
    if (profileHasUnsavedChanges) {
      setProfileCloseConfirmOpen(true);
      return;
    }

    closeProfileEditor();
  };
  const cancelProfileCloseConfirm = () => {
    setProfileCloseConfirmOpen(false);
  };
  const discardProfileChanges = () => {
    setProfileCloseConfirmOpen(false);
    closeProfileEditor();
  };
  const saveAndCloseProfileEditor = async () => {
    const saved = await saveProfile();

    if (!saved) {
      setProfileCloseConfirmOpen(false);
      return;
    }

    setProfileCloseConfirmOpen(false);
    closeProfileEditor();
  };
  const {
    query: messageSearchQuery,
    results: messageSearchResults,
    loading: messageSearchLoading,
    error: messageSearchError,
    hasSearched: messageSearchHasSearched,
    activeResultId: activeSearchResultId,
    setQuery: setMessageSearchQuery,
    setResults: setMessageSearchResults,
    setActiveResultId: setActiveSearchResultId,
    clearSearchState: clearMessageSearchState,
    reset: resetMessageSearch,
  } = useMessageSearch({
    activeChatId,
    onSessionExpired,
  });
  const {
    openMessageMenuId,
    messageMenuPosition,
    messageMenuCopyTarget,
    messageActionDialog,
    actionAlsoForOtherUser,
    setActionAlsoForOtherUser,
    openMessageMenu,
    closeMessageMenu,
    openMessageActionDialog,
    closeMessageActionDialog,
    closeMessageStateForMessage,
  } = useMessageActionMenu();
  const messagesRef = useRef<HTMLUListElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activePinnedMessageId, setActivePinnedMessageId] = useState<
    number | null
  >(null);
  const [
    unreadSeparatorLastReadMessageId,
    setUnreadSeparatorLastReadMessageId,
  ] = useState<number | null>(null);
  const unreadSeparatorChatIdRef = useRef<number | null>(null);
  const unreadSeparatorInitialLastMessageIdRef = useRef<number | null>(null);
  const pinnedBarActiveOverrideRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const {
    stopTypingActivity,
    handleMessageInputChange,
    emitTypingStoppedBeforeDisconnect,
    clearChatActivity,
    clearUserActivity,
    handleTypingActivity,
    handleRecordingVoiceActivity,
    getChatActivitySubtitle,
  } = useChatActivity({
    socketRef,
    activeChatIdRef,
    currentUserId: user.userId,
    hasDraftRecipient: draftRecipient !== null,
    setMessage,
  });
  const {
    recorder: voiceRecorder,
    elapsedMs: voiceRecordingElapsedMs,
    startRecording,
    stopRecording,
  } = useVoiceRecorder({
    onActivityChange: (chatId, isRecording) => {
      if (chatId === null) {
        return;
      }

      socketRef.current?.emit("recording_voice", {
        chat_id: chatId,
        is_recording: isRecording,
      });
    },
    onError: setChatError,
  });
  const activeChat = chats.find(
    (chat) => chat.id === activeChatId,
  );
  const {
    permission: notificationsPermission,
    isEnabled: notificationsEnabled,
    requestNotifications,
    notifyIncomingMessage,
  } = useBrowserNotifications({
    userId: user.userId,
    chats,
    activeChatIdRef,
  });
  const isMessagingBlocked =
    activeChat?.type === "direct" && activeChat.is_blocked_by_other === true;
  const {
    canSendTextMessages: hasGroupWritePermission,
    refreshPermissions: refreshChatPermissions,
  } = useChatPermissions({ activeChat, onSessionExpired });
  const canSendTextMessages =
    !isMessagingBlocked && hasGroupWritePermission;

  useEffect(() => {
    if (activeChatId === null) {
      unreadSeparatorChatIdRef.current = null;
      unreadSeparatorInitialLastMessageIdRef.current = null;
      setUnreadSeparatorLastReadMessageId(null);
      return;
    }

    if (unreadSeparatorChatIdRef.current === activeChatId) {
      return;
    }

    if (!activeChat) {
      return;
    }

    unreadSeparatorChatIdRef.current = activeChatId;
    unreadSeparatorInitialLastMessageIdRef.current =
      activeChat.unread_count > 0 ? activeChat.last_message_id : null;
    setUnreadSeparatorLastReadMessageId(
      activeChat.unread_count > 0
        ? (activeChat.current_last_read_message_id ?? 0)
        : null,
    );
  }, [activeChat, activeChatId]);

  const {
    saveChatScrollPosition,
    readComposerDraft,
    saveComposerDraft,
    clearComposerDraft: clearStoredComposerDraft,
    saveActiveEditDraft,
    clearActiveEditDraft,
    readActiveEditDraft,
    saveEditDraft,
    readEditDraft,
    clearEditDraft,
  } = useChatPersistence(user.userId);
  const {
    replyToMessage,
    setReplyToMessage,
    clearComposerDraft,
    restoreComposerDraft,
  } = useComposerDrafts({
    activeChatId,
    hasDraftRecipient: draftRecipient !== null,
    message,
    setMessage,
    readComposerDraft,
    saveComposerDraft,
    clearStoredComposerDraft,
  });
  const {
    editingMessageId,
    editingMessageText,
    editingMessageSaving,
    setEditingMessageText,
    setEditingMessageSaving,
    resetEditingState,
    restoreEditDraft,
    startEditingMessage: startEditingMessageDraft,
    cancelEditingMessage,
    clearEditStateForMessage,
    finishEditingMessage,
  } = useMessageEditing({
    activeChatId,
    currentUserId: user.userId,
    readActiveEditDraft,
    saveActiveEditDraft,
    clearActiveEditDraft,
    readEditDraft,
    saveEditDraft,
    clearEditDraft,
  });
  const {
    applyLocalReadState,
    markChatReadThrough,
    prepareMessageScroll,
    clearChatReadState,
  } = useMessageReadTracking({
    messagesRef,
    activeChatId,
    activeChat,
    messages,
    currentUserId: user.userId,
    setChats,
    saveChatScrollPosition,
    onSessionExpired,
    onError: setChatError,
  });
  const {
    isOpen: chatInfoOpen,
    members: chatInfoMembers,
    setMembers: setChatInfoMembers,
    loading: chatInfoLoading,
    error: chatInfoError,
    isAddingMember: chatInfoAddingMember,
    isManaging: chatInfoManaging,
    addMemberQuery,
    addMemberLoading,
    addMemberError,
    addMemberMessage,
    setIsOpen: setChatInfoOpen,
    setError: setChatInfoError,
    setIsAddingMember: setChatInfoAddingMember,
    setIsManaging: setChatInfoManaging,
    resetTransientState: resetChatInfoPanel,
    openAddMemberPanel,
    updateAddMemberQuery,
    loadMembers: loadChatInfoMembers,
    addMemberToActiveGroup: handleAddMemberToActiveGroup,
    handleMembersRemoved,
  } = useChatInfoPanel({
    activeChat,
    setChats,
    applyLocalReadState,
    onSessionExpired,
    onChatError: setChatError,
  });
  const {
    selectedChatMember,
    selectedMemberManagementMode,
    memberPermissions,
    memberPermissionsDraft,
    memberPermissionsLoading,
    memberPermissionsSaving,
    memberPermissionsError,
    memberPermissionsMessage,
    selectedMemberPermissionsDraft,
    selectedMemberPermissionsSaving,
    selectedMemberPermissionsError,
    selectedMemberPermissionsMessage,
    adminPermissionsLoadingUserId,
    adminPermissionsError,
    adminPermissionsMessage,
    memberRemovalUserId,
    memberRemovalError,
    memberRemovalMessage,
    memberRemovalCandidate,
    currentUserCanDeleteGroupMessages,
    currentUserCanPinGroupMessages,
    currentUserCanManageAdmins,
    currentUserCanChangeGroupInfo,
    currentUserCanRemoveGroupMembers,
    selectedAdminPermissions,
    canEditSelectedAdmin,
    canPromoteSelectedMember,
    canRemoveSelectedMember,
    canEditSelectedMemberPermissions,
    hasSelectedMemberManagementActions,
    selectedMemberPermissionIsSaving,
    selectedMemberRemovalIsSaving,
    setSelectedChatMember,
    setSelectedMemberManagementMode,
    reset: resetGroupMemberManagement,
    clearMemberRemoval,
    clearRemovedMembers,
    loadMemberDefaultPermissions,
    openChatMemberProfile,
    updateMemberBooleanPermission,
    updateMemberNumericPermission,
    updateSelectedMemberBooleanPermission,
    updateSelectedMemberNumericPermission,
    updateAdminPermission,
    addMemberTag,
    saveMemberDefaultPermissions,
    saveSelectedMemberPermissions,
    promoteSelectedMember,
    saveSelectedAdminPermissions,
    dismissSelectedAdmin,
    startRemovingMember,
    cancelRemovingMember,
    removeSelectedChatMember,
    adminPermissionIsForcedByMemberDefault,
    memberPermissionIsLockedByDefault,
  } = useGroupMemberManagement({
    activeChat,
    currentUserId: user.userId,
    onSessionExpired,
    setChats,
    setChatInfoMembers,
    getChatMemberDisplayName,
  });
  const { refreshChats } = useChatData({
    userId: user.userId,
    activeChatId,
    activeChatIdRef,
    setChats,
    setMessages,
    setMessagesLoading,
    setActiveChatId,
    applyLocalReadState,
    restoreComposerDraft,
    restoreEditDraft,
    onSessionExpired,
    onError: setChatError,
  });
  const {
    applyMessageUpdate,
    removeMessageLocally,
    removeMessagesLocally,
    startEditingMessage,
    saveMessageEdit,
    pinMessage,
    unpinMessage,
    deleteMessage,
  } = useMessageMutations({
    userId: user.userId,
    activeChat,
    messages,
    editingMessageText,
    setMessages,
    setMessageSearchResults,
    setActiveSearchResultId,
    setReplyToMessage,
    setChats,
    setEditingMessageSaving,
    startEditingMessageDraft,
    cancelEditingMessage,
    clearEditStateForMessage,
    finishEditingMessage,
    closeMessageMenu,
    closeMessageStateForMessage,
    refreshChats,
    onSessionExpired,
    onError: setChatError,
    onClearError: () => setChatError(null),
  });
  const { toggleChatPin, reorderPinnedChats } = useChatSettings({
    setChats,
    onSessionExpired,
    onError: setChatError,
    onClearError: () => setChatError(null),
  });
  const {
    voiceSending,
    fileSending,
    sendVoiceMessage,
    sendAttachmentDrafts,
    sendTextMessage,
  } = useMessageSending({
    user,
    activeChatId,
    activeChat,
    activeChatIdRef,
    socketRef,
    draftRecipient,
    canSendTextMessages,
    message,
    replyToMessage,
    attachmentDrafts,
    attachmentCaption,
    setMessages,
    setChats,
    setMessage,
    setDraftRecipient,
    setActiveChatId,
    setReplyToMessage,
    setAttachmentError,
    removeAttachmentDraft,
    clearComposerDraft,
    markChatReadThrough,
    closeMessageMenu,
    closeMessageActionDialog,
    stopTypingActivity,
    onSessionExpired,
    onError: setChatError,
  });

  const socketEvents = useChatSocketEvents({
    userId: user.userId,
    activeChatIdRef,
    setMessages,
    setChats,
    setMessageSearchResults,
    setActiveChatId,
    setDraftRecipient,
    setMessage,
    setReplyToMessage,
    setSelectedChatMember,
    applyLocalReadState,
    applyMessageUpdate,
    removeMessageLocally,
    removeMessagesLocally,
    refreshChats,
    refreshChatPermissions,
    emitTypingStoppedBeforeDisconnect,
    clearUserActivity,
    handleTypingActivity,
    handleRecordingVoiceActivity,
    clearChatActivity,
    handleMembersRemoved,
    clearRemovedMembers,
    clearChatReadState,
    resetChatInfoPanel,
    clearMemberRemoval,
    onIncomingMessage: notifyIncomingMessage,
    onIncomingActiveChatMessage: () => {
      unreadSeparatorInitialLastMessageIdRef.current = null;
      setUnreadSeparatorLastReadMessageId(null);
    },
    onChatError: setChatError,
  });

  const { status, connectionError, retry: retrySocketConnection } =
    useChatSocket({
      socketRef,
      activeChatIdRef,
      userId: user.userId,
      onSessionExpired,
      ...socketEvents,
    });

  useEffect(() => {
    stopTypingActivity();
    resetMessageSearch();
    resetChatInfoPanel();
    resetGroupMemberManagement();
    resetEditingState();
  }, [
    activeChatId,
    draftRecipient?.id,
    resetEditingState,
    resetChatInfoPanel,
    resetGroupMemberManagement,
    resetMessageSearch,
    stopTypingActivity,
  ]);

  const startVoiceRecording = async () => {
    if (draftRecipient) {
      setChatError("Send a text message first before using voice messages.");
      return;
    }

    if (activeChatId === null) {
      setChatError("Select a chat before recording a voice message.");
      return;
    }

    const started = await startRecording(activeChatId);
    if (started) {
      stopTypingActivity(activeChatId);
      setChatError(null);
    }
  };

  const stopVoiceRecording = async (send: boolean) => {
    const recording = await stopRecording(send);

    if (send && recording) {
      await sendVoiceMessage(recording.blob, recording.durationMs);
    }
  };

  useEffect(() => {
    if (!isMessagingBlocked || voiceRecorder === null) {
      return;
    }

    void stopRecording(false);
  }, [isMessagingBlocked, stopRecording, voiceRecorder]);

  const {
    joinChat,
    handleChatHeaderClick,
    openDraftChat,
  } = useChatNavigation({
    chats,
    activeChat,
    activeChatIdRef,
    socketRef,
    currentUserId: user.userId,
    chatInfoOpen,
    selectedChatMember,
    isVoiceRecording: voiceRecorder !== null,
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
    restoreComposerDraft,
    resetEditingState,
    closeMessageMenu,
    closeMessageActionDialog,
    stopTypingActivity,
    stopVoiceRecording: (send) => {
      void stopVoiceRecording(send);
    },
    loadChatInfoMembers,
    loadMemberDefaultPermissions,
    clearMemberRemoval,
    clearProfileSearchResult,
    setProfileSearchError,
    applyLocalReadState,
    onChatChange: () => {
      setMessageSearchOpen(false);
      resetMessageSearch();
    },
    onSessionExpired,
  });

  const {
    isOpen: creatingGroup,
    title: groupTitle,
    description: groupDescription,
    avatarPreviewUrl: groupAvatarPreviewUrl,
    memberQuery: groupMemberQuery,
    selectedMembers: groupSelectedMembers,
    memberLoading: groupMemberLoading,
    creating: groupCreating,
    error: groupError,
    message: groupMessage,
    setTitle: setGroupTitle,
    setDescription: setGroupDescription,
    setAvatarFile: setGroupAvatarFile,
    setMemberQuery: setGroupMemberQuery,
    open: openCreateGroup,
    close: closeCreateGroup,
    addSelectedMember: handleAddSelectedGroupMember,
    removeSelectedMember: removeSelectedGroupMember,
    create: handleCreateGroup,
  } = useCreateGroup({
    currentUserId: user.userId,
    onSessionExpired,
    onCreatedGroup: (createdChat) => {
      setChats((current) =>
        upsertChat(current, applyLocalReadState(createdChat)),
      );
      joinChat(createdChat);
    },
  });
  const showChatSelectionPlaceholder =
    !creatingGroup && activeChat === undefined && draftRecipient === null;

  useEffect(() => {
    if (
      (activeChatId === null && draftRecipient === null) ||
      creatingGroup ||
      editingProfile ||
      chatInfoOpen ||
      selectedChatMember ||
      memberRemovalCandidate ||
      messageActionDialog ||
      chatDeleteTarget ||
      groupLeaveTarget ||
      imageViewer ||
      attachmentDrafts.length > 0 ||
      editingAttachmentMessage ||
      voiceRecorder ||
      !canSendTextMessages
    ) {
      return;
    }

    requestAnimationFrame(() => {
      messageInputRef.current?.focus({ preventScroll: true });
    });
  }, [
    activeChatId,
    attachmentDrafts.length,
    chatInfoOpen,
    creatingGroup,
    draftRecipient,
    editingAttachmentMessage,
    editingProfile,
    imageViewer,
    memberRemovalCandidate,
    messageActionDialog,
    chatDeleteTarget,
    groupLeaveTarget,
    selectedChatMember,
    voiceRecorder,
    canSendTextMessages,
  ]);

  const {
    visibleMessages,
    getReplySenderName,
    getSenderName,
    getSenderAvatar,
    getMessageDeliveryStatus,
  } = useMessageDisplay({
    user,
    activeChat,
    activeChatId,
    messages,
  });

  useEffect(() => {
    if (
      activeChatId === null ||
      unreadSeparatorLastReadMessageId === null ||
      unreadSeparatorInitialLastMessageIdRef.current === null
    ) {
      return;
    }

    const initialLastMessageId = unreadSeparatorInitialLastMessageIdRef.current;
    const hasNewMessageAfterSeparator = visibleMessages.some(
      (entry) =>
        entry.delivery_status !== "failed" &&
        entry.id > initialLastMessageId,
    );

    if (hasNewMessageAfterSeparator) {
      unreadSeparatorInitialLastMessageIdRef.current = null;
      setUnreadSeparatorLastReadMessageId(null);
    }
  }, [
    activeChatId,
    unreadSeparatorLastReadMessageId,
    visibleMessages,
  ]);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    const pinnedMessages = visibleMessages
      .filter((entry) => entry.pinned_at || entry.is_pinned_for_me)
      .sort((first, second) =>
        (first.created_at ?? "").localeCompare(second.created_at ?? ""),
      );
    let animationFrameId: number | null = null;

    const updateActivePinnedMessage = () => {
      if (!messagesElement || pinnedMessages.length === 0) {
        setActivePinnedMessageId((current) =>
          current === null ? current : null,
        );
        return;
      }

      const containerRect = messagesElement.getBoundingClientRect();
      const viewportAnchor =
        messagesElement.scrollTop + messagesElement.clientHeight / 2;
      let nextPinnedMessageId = pinnedMessages[0].id;

      const getMessageBounds = (messageId: number) => {
        const target = messagesElement.querySelector(
          `[data-message-id="${messageId}"]`,
        );

        if (!(target instanceof HTMLElement)) {
          return null;
        }

        const targetRect = target.getBoundingClientRect();
        const targetTop =
          targetRect.top - containerRect.top + messagesElement.scrollTop;

        return {
          top: targetTop,
          bottom: targetTop + targetRect.height,
        };
      };

      const overridePinnedMessageId = pinnedBarActiveOverrideRef.current;

      if (overridePinnedMessageId !== null) {
        const overrideStillExists = pinnedMessages.some(
          (entry) => entry.id === overridePinnedMessageId,
        );

        if (overrideStillExists) {
          setActivePinnedMessageId((current) =>
            current === overridePinnedMessageId
              ? current
              : overridePinnedMessageId,
          );
          return;
        }

        pinnedBarActiveOverrideRef.current = null;
      }

      for (const entry of pinnedMessages) {
        const targetBounds = getMessageBounds(entry.id);

        if (!targetBounds) {
          continue;
        }

        if (targetBounds.bottom <= viewportAnchor + 1) {
          nextPinnedMessageId = entry.id;
        } else {
          break;
        }
      }

      setActivePinnedMessageId((current) =>
        current === nextPinnedMessageId ? current : nextPinnedMessageId,
      );
    };

    const scheduleActivePinnedMessageUpdate = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(updateActivePinnedMessage);
    };

    const clearPinnedBarOverride = () => {
      if (pinnedBarActiveOverrideRef.current === null) {
        return;
      }

      pinnedBarActiveOverrideRef.current = null;
      scheduleActivePinnedMessageUpdate();
    };

    scheduleActivePinnedMessageUpdate();

    if (!messagesElement) {
      return () => {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
        }
      };
    }

    messagesElement.addEventListener("scroll", scheduleActivePinnedMessageUpdate, {
      passive: true,
    });
    messagesElement.addEventListener("wheel", clearPinnedBarOverride, {
      passive: true,
    });
    messagesElement.addEventListener("touchstart", clearPinnedBarOverride, {
      passive: true,
    });
    messagesElement.addEventListener("pointerdown", clearPinnedBarOverride);
    window.addEventListener("resize", scheduleActivePinnedMessageUpdate);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      messagesElement.removeEventListener(
        "scroll",
        scheduleActivePinnedMessageUpdate,
      );
      messagesElement.removeEventListener("wheel", clearPinnedBarOverride);
      messagesElement.removeEventListener("touchstart", clearPinnedBarOverride);
      messagesElement.removeEventListener("pointerdown", clearPinnedBarOverride);
      window.removeEventListener("resize", scheduleActivePinnedMessageUpdate);
    };
  }, [visibleMessages]);
  const composerEditingMessage =
    editingMessageId === null
      ? null
      : messages.find((entry) => entry.id === editingMessageId) ?? null;
  const attachmentEditTarget =
    editingAttachmentMessage ??
    (attachmentDrafts.length > 0 ? composerEditingMessage : null);
  const {
    getChatTitle,
    getChatSubtitle,
    chatHeaderTitle,
    chatHeaderSubtitle,
    chatHeaderClickable,
    actionDialogEntry,
    actionDialogChat,
    actionDialogOtherUserDisplayName,
  } = useChatPresentation({
    user,
    chats,
    activeChat,
    draftRecipient,
    messageActionDialog,
    getChatActivitySubtitle,
  });
  const directContactUserId =
    activeChat?.type === "direct" ? activeChat.other_user_id : null;
  const selectedDirectProfile =
    selectedChatMember && activeChat?.type === "direct"
      ? toUserProfile(selectedChatMember)
      : null;

  const revealMessageById = (
    messageId: number,
    options?: { nextActivePinnedMessageId: number | null },
  ) => {
    const nextActivePinnedMessageId =
      options?.nextActivePinnedMessageId ?? null;

    pinnedBarActiveOverrideRef.current = nextActivePinnedMessageId;
    if (nextActivePinnedMessageId !== null) {
      setActivePinnedMessageId((current) =>
        current === nextActivePinnedMessageId
          ? current
          : nextActivePinnedMessageId,
      );
    }

    if (searchHighlightTimeoutRef.current !== null) {
      window.clearTimeout(searchHighlightTimeoutRef.current);
    }

    setActiveSearchResultId(messageId);
    searchHighlightTimeoutRef.current = window.setTimeout(() => {
      setActiveSearchResultId((current) =>
        current === messageId ? null : current,
      );
      searchHighlightTimeoutRef.current = null;
    }, 2600);

    const target = messagesRef.current?.querySelector(
      `[data-message-id="${messageId}"]`,
    );

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center" });
      requestAnimationFrame(() => {
        messagesRef.current?.dispatchEvent(new Event("scroll"));
      });
    }
  };

  const revealMessageSearchResult = (entry: ChatMessage) => {
    revealMessageById(entry.id);
  };

  const closeMessageSearch = () => {
    setMessageSearchOpen(false);
    resetMessageSearch();
  };

  useEffect(() => {
    return () => {
      if (searchHighlightTimeoutRef.current !== null) {
        window.clearTimeout(searchHighlightTimeoutRef.current);
      }
    };
  }, []);

  const startReplyingToMessage = (entry: ChatMessage) => {
    setReplyToMessage(entry);
    setChatError(null);
    closeMessageMenu();
  };

  const cancelAttachmentEdit = () => {
    setEditingAttachmentMessage(null);
    setAttachmentEditSaving(false);
    clearAttachmentDrafts();
  };

  const startEditingMessageFromMenu = (entry: ChatMessage) => {
    const attachments = getMessageAttachments(entry);
    if (attachments.length === 0) {
      setReplyToMessage(null);
      startEditingMessage(entry);
      requestAnimationFrame(() => {
        document.getElementById("message")?.focus();
      });
      return;
    }

    setEditingAttachmentMessage(entry);
    setDraftsFromAttachments(attachments, entry.content ?? "");
    setAttachmentEditSaving(false);
    setChatError(null);
    closeMessageMenu();
  };

  const saveAttachmentEdit = async (targetMessage: ChatMessage | null) => {
    if (!targetMessage || attachmentEditSaving) {
      return;
    }

    const formData = new FormData();
    formData.append("content", attachmentCaption);
    attachmentDrafts.forEach((draft) => {
      if (draft.existingAttachmentId) {
        formData.append("existing_attachment_ids", draft.existingAttachmentId);
      }

      if (draft.file) {
        formData.append("files", draft.file);
      }
    });

    setAttachmentEditSaving(true);
    setAttachmentError(null);
    setChatError(null);

    try {
      const updatedMessage = await apiFetch<ChatMessage>(
        `/messages/${targetMessage.id}`,
        {
          method: "PATCH",
          body: formData,
        },
      );

      applyMessageUpdate(updatedMessage);
      setEditingAttachmentMessage(null);
      if (editingMessageId === targetMessage.id) {
        finishEditingMessage(targetMessage.chat_id, targetMessage.id);
      }
      clearAttachmentDrafts();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to edit attachments.";

      if (errorMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAttachmentError(errorMessage);
      setChatError(errorMessage);
    } finally {
      setAttachmentEditSaving(false);
    }
  };

  const handlePasteImages = (
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    if (
      composerEditingMessage &&
      !editingAttachmentMessage &&
      attachmentDrafts.length === 0
    ) {
      setAttachmentCaption(editingMessageText);
    }
    addAttachmentDrafts(imageFiles);
  };

  const handleComposerFileInputChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (
      composerEditingMessage &&
      !editingAttachmentMessage &&
      attachmentDrafts.length === 0
    ) {
      setAttachmentCaption(editingMessageText);
    }
    handleFileInputChange(event);
  };

  const copyMessage = async (
    entry: ChatMessage,
    copyTarget: MessageCopyTarget | null,
  ) => {
    closeMessageMenu();
    setChatError(null);

    try {
      if (copyTarget?.type === "image") {
        await copyMessageImageToClipboard(entry, copyTarget.attachmentIndex);
      } else if (copyTarget?.type === "text") {
        if (!entry.content) {
          throw new Error("This message has no text to copy.");
        }

        await navigator.clipboard.writeText(entry.content);
      } else {
        await copyMessageToClipboard(entry);
      }
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Unable to copy message.",
      );
    }
  };

  const copyViewerImage = async (
    entry: ChatMessage,
    attachmentIndex: number,
  ) => {
    setChatError(null);

    try {
      await copyMessageImageToClipboard(entry, attachmentIndex);
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Unable to copy image.",
      );
    }
  };

  const canDeleteViewerMessage = (entry: ChatMessage) => {
    if (
      entry.temp_id ||
      entry.delivery_status === "sending" ||
      entry.delivery_status === "failed"
    ) {
      return false;
    }

    if (activeChat?.type === "group") {
      return (
        entry.sender_id === user.userId || currentUserCanDeleteGroupMessages
      );
    }

    return true;
  };

  const canUnpinPinnedBarMessage = (entry: ChatMessage) => {
    if (
      entry.temp_id ||
      entry.delivery_status === "sending" ||
      entry.delivery_status === "failed"
    ) {
      return false;
    }

    if (entry.is_pinned_for_me) {
      return true;
    }

    if (!entry.pinned_at || !activeChat) {
      return false;
    }

    if (activeChat.type !== "group") {
      return true;
    }

    return currentUserCanPinGroupMessages;
  };

  const confirmPinAction = (scope: "me" | "chat" | "unpin") => {
    const entry = messageActionDialog?.entry;
    if (!entry) {
      return;
    }

    closeMessageActionDialog();

    if (scope === "unpin") {
      void unpinMessage(entry);
      return;
    }

    void pinMessage(entry, scope);
  };

  const confirmDeleteAction = (scope: "me" | "chat") => {
    const entry = messageActionDialog?.entry;
    if (!entry) {
      return;
    }

    closeMessageActionDialog();
    void deleteMessage(entry, scope);
  };

  const openChatDeleteDialog = (
    chat: Chat,
    action: ChatDeleteTarget["action"] = "delete",
  ) => {
    setChatDeleteTarget({ chat, action });
    setDeleteChatMessagesForEveryone(false);
    setChatError(null);
  };

  const closeChatDeleteDialog = () => {
    if (chatDeleting) {
      return;
    }

    setChatDeleteTarget(null);
    setDeleteChatMessagesForEveryone(false);
  };

  const openLeaveGroupDialog = (chat: Chat) => {
    if (chat.type !== "group") {
      return;
    }

    setGroupLeaveTarget(chat);
    setChatError(null);
  };

  const closeLeaveGroupDialog = () => {
    if (!groupLeaving) {
      setGroupLeaveTarget(null);
    }
  };

  const confirmLeaveGroup = async () => {
    const chat = groupLeaveTarget;
    if (!chat) {
      return;
    }

    setGroupLeaving(true);

    try {
      await apiFetch<{ ok: boolean }>(`/chats/${chat.id}/leave`, {
        method: "POST",
      });
      setGroupLeaveTarget(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to leave group.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setGroupLeaveTarget(null);
      setChatError(message);
    } finally {
      setGroupLeaving(false);
    }
  };

  const confirmChatDelete = async () => {
    const target = chatDeleteTarget;
    if (!target) {
      return;
    }

    const { chat, action } = target;

    setChatDeleting(true);

    try {
      await apiFetch<{ ok: boolean }>(`/chats/${chat.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          delete_messages_for_everyone: deleteChatMessagesForEveryone,
          clear_history: action === "clear",
        }),
      });

      const isActiveChat = activeChatIdRef.current === chat.id;
      const clearsHistory =
        action === "clear" ||
        (chat.type === "group" && chat.member_count >= 2);
      const nextChat = chats.find(
        (candidate) => candidate.id !== chat.id && candidate.type === "self",
      ) ?? chats.find((candidate) => candidate.id !== chat.id) ?? null;

      setChats((current) =>
        clearsHistory
          ? current.map((candidate) =>
              candidate.id === chat.id
                ? {
                    ...candidate,
                    last_message_id: null,
                    last_message_text: null,
                    last_message_sender_id: null,
                    last_message_created_at: null,
                    unread_count: 0,
                  }
                : candidate,
            )
          : current.filter((candidate) => candidate.id !== chat.id),
      );
      clearChatReadState(chat.id);
      clearComposerDraft(chat.id);

      if (isActiveChat) {
        if (clearsHistory) {
          setMessages([]);
          setMessagesLoading(false);
          setMessage("");
          setReplyToMessage(null);
          setMessageSearchOpen(false);
          resetMessageSearch();
          resetEditingState();
        } else if (nextChat) {
          joinChat(nextChat);
        } else {
          socketRef.current?.emit("leave_room", String(chat.id));
          activeChatIdRef.current = null;
          setActiveChatId(null);
          setDraftRecipient(null);
          setMessages([]);
          setMessagesLoading(false);
          setMessage("");
          setReplyToMessage(null);
          resetMessageSearch();
          resetEditingState();
          resetChatInfoPanel();
          clearMemberRemoval();
        }
      }

      if (clearsHistory) {
        void refreshChats();
      }

      setChatDeleteTarget(null);
      setDeleteChatMessagesForEveryone(false);
      setChatError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete chat.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    } finally {
      setChatDeleting(false);
    }
  };

  const updateActiveGroupProfile = async (
    title: string,
    description: string,
    avatar: File | null,
  ) => {
    if (!activeChat || activeChat.type !== "group") {
      throw new Error("Select a group before updating its profile.");
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    if (avatar) {
      formData.append("avatar", avatar);
    }

    try {
      const updated = await apiFetch<
        Pick<
          Chat,
          | "id"
          | "type"
          | "title"
          | "description"
          | "avatar_url"
          | "last_message_id"
          | "deleted_at"
          | "created_at"
          | "updated_at"
        >
      >(`/chats/${activeChat.id}/group`, {
        method: "PATCH",
        body: formData,
      });

      setChats((current) =>
        current.map((chat) =>
          chat.id === updated.id
            ? {
                ...chat,
                ...updated,
                display_title: updated.title ?? chat.display_title,
                display_avatar_url: updated.avatar_url || "/favicon.svg",
              }
            : chat,
        ),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
      }

      throw error;
    }
  };

  const deleteActiveGroupForEveryone = async () => {
    if (!activeChat || activeChat.type !== "group") {
      throw new Error("Select a group before deleting it.");
    }

    const chat = activeChat;
    try {
      await apiFetch<{ ok: boolean }>(`/chats/${chat.id}/group`, {
        method: "DELETE",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
      }

      throw error;
    }

    const isActiveChat = activeChatIdRef.current === chat.id;
    const nextChat =
      chats.find(
        (candidate) => candidate.id !== chat.id && candidate.type === "self",
      ) ?? chats.find((candidate) => candidate.id !== chat.id) ?? null;

    setChats((current) => current.filter((candidate) => candidate.id !== chat.id));
    clearChatReadState(chat.id);
    clearComposerDraft(chat.id);
    resetChatInfoPanel();
    clearMemberRemoval();

    if (!isActiveChat) {
      return;
    }

    if (nextChat) {
      joinChat(nextChat);
      return;
    }

    socketRef.current?.emit("leave_room", String(chat.id));
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setDraftRecipient(null);
    setMessages([]);
    setMessagesLoading(false);
    setMessage("");
    setReplyToMessage(null);
    resetMessageSearch();
    resetEditingState();
  };

  return (
    <main className="chat-shell">
      <div className="chat-layout">
        <ChatAccountRail
          user={user}
          themeMode={themeMode}
          chatsActive={!contactsOpen && !messageSearchOpen}
          contactsOpen={contactsOpen}
          notificationsPermission={notificationsPermission}
          notificationsEnabled={notificationsEnabled}
          onToggleProfileEditor={openProfileEditor}
          onOpenChats={() => {
            setContactsOpen(false);
            closeMessageSearch();
          }}
          onToggleContacts={() => {
            if (!contactsOpen) {
              setMessageSearchOpen(false);
              resetMessageSearch();
              void refreshContacts();
            }
            setContactsOpen(!contactsOpen);
          }}
          onToggleNotifications={() => {
            void requestNotifications();
          }}
          onSignOut={onSignOut}
          onToggleTheme={onToggleTheme}
        />
        {messageSearchOpen ? (
          <aside className="chat-sidebar search-mode" aria-label="Search messages">
            <MessageSearch
              activeChatId={activeChatId}
              query={messageSearchQuery}
              results={messageSearchResults}
              loading={messageSearchLoading}
              error={messageSearchError}
              hasSearched={messageSearchHasSearched}
              activeResultId={activeSearchResultId}
              autoFocus
              onQueryChange={setMessageSearchQuery}
              onClearSearchState={clearMessageSearchState}
              onCloseSearch={closeMessageSearch}
              onRevealResult={revealMessageSearchResult}
              getSenderName={getSenderName}
            />
          </aside>
        ) : contactsOpen ? (
          <ContactsSidebar
            contacts={contacts}
            loading={contactsLoading}
            error={contactsError}
            onViewContact={(contact) => {
              setSelectedContactProfile(contact);
            }}
          />
        ) : (
          <ChatSidebar
            profileQuery={profileQuery}
            profileResult={profileResult}
            profileError={profileError}
            profileLoading={profileLoading}
            chats={chats}
            activeChatId={activeChatId}
            draftRecipient={draftRecipient}
            onProfileQueryChange={setProfileQuery}
            onClearProfileSearch={clearProfileSearch}
            onViewProfile={setSelectedContactProfile}
            onJoinChat={joinChat}
            onToggleChatPin={(chat) => {
              void toggleChatPin(chat);
            }}
            onDeleteChat={openChatDeleteDialog}
            onClearHistory={(chat) => openChatDeleteDialog(chat, "clear")}
            onLeaveGroup={openLeaveGroupDialog}
            onReorderPinnedChats={(chatIds) => {
              void reorderPinnedChats(chatIds);
            }}
            getChatTitle={getChatTitle}
            getChatSubtitle={getChatSubtitle}
            onOpenCreateGroup={openCreateGroup}
          />
        )}
        <section className="chat-card">
          {!showChatSelectionPlaceholder ? (
            <div className="chat-top-stack">
              <ChatHeader
                key={activeChatId ?? "draft"}
                title={chatHeaderTitle}
                subtitle={chatHeaderSubtitle}
                clickable={chatHeaderClickable}
                onClick={handleChatHeaderClick}
                searchEnabled={activeChatId !== null && draftRecipient === null}
                searchActive={messageSearchOpen}
                showChatMenu={activeChatId !== null && draftRecipient === null}
                showContactMenu={directContactUserId !== null}
                showLeaveGroup={activeChat?.type === "group"}
                showClearHistory={
                  activeChat?.type === "self" ||
                  activeChat?.type === "direct" ||
                  (activeChat?.type === "group" && activeChat.member_count >= 2)
                }
                showDeleteChat={
                  !activeChat ||
                  activeChat.type !== "group" ||
                  activeChat.member_count < 2
                }
                onSearchClick={() => {
                  if (activeChatId === null || draftRecipient !== null) {
                    return;
                  }

                  setMessageSearchOpen((current) => {
                    if (current) {
                      resetMessageSearch();
                    } else {
                      setContactsOpen(false);
                    }
                    return !current;
                  });
                }}
                onViewProfile={handleChatHeaderClick}
                onDeleteChat={() => {
                  if (activeChat) {
                    openChatDeleteDialog(activeChat);
                  }
                }}
                onClearHistory={() => {
                  if (activeChat) {
                    openChatDeleteDialog(activeChat, "clear");
                  }
                }}
                onLeaveGroup={() => {
                  if (activeChat) {
                    openLeaveGroupDialog(activeChat);
                  }
                }}
              />
              {!creatingGroup ? (
                <PinnedMessagesBar
                  messages={visibleMessages}
                  activePinnedMessageId={activePinnedMessageId}
                  canUnpinMessage={canUnpinPinnedBarMessage}
                  onRequestUnpin={(entry) => {
                    openMessageActionDialog("pin", entry);
                  }}
                  onRevealMessage={revealMessageById}
                />
              ) : null}
            </div>
          ) : null}

          {creatingGroup ? (
            <CreateGroupPanel
              isOpen={creatingGroup}
              title={groupTitle}
              description={groupDescription}
              avatarPreviewUrl={groupAvatarPreviewUrl}
              memberQuery={groupMemberQuery}
              selectedMembers={groupSelectedMembers}
              memberLoading={groupMemberLoading}
              creating={groupCreating}
              error={groupError}
              message={groupMessage}
              onClose={closeCreateGroup}
              onTitleChange={setGroupTitle}
              onDescriptionChange={setGroupDescription}
              onAvatarFileChange={setGroupAvatarFile}
              onMemberQueryChange={setGroupMemberQuery}
              onAddMember={() => {
                void handleAddSelectedGroupMember();
              }}
              onRemoveMember={removeSelectedGroupMember}
              onSubmit={handleCreateGroup}
            />
          ) : (
            <>
        {chatInfoOpen && activeChat && activeChat.type === "group" ? (
          <GroupInfoPanel
            chat={activeChat}
            members={chatInfoMembers}
            loading={chatInfoLoading}
            error={chatInfoError}
            isAddingMember={chatInfoAddingMember}
            isManaging={chatInfoManaging}
            canManageGroup={
              currentUserCanChangeGroupInfo ||
              currentUserCanManageAdmins ||
              currentUserCanRemoveGroupMembers
            }
            canEditGroupInfo={currentUserCanChangeGroupInfo}
            canManageMembers={currentUserCanRemoveGroupMembers}
            canDeleteGroup={activeChat.current_user_role === "owner"}
            memberRemovalUserId={memberRemovalUserId}
            memberRemovalError={memberRemovalError}
            memberRemovalMessage={memberRemovalMessage}
            selectedChatMember={selectedChatMember}
            addMemberQuery={addMemberQuery}
            addMemberLoading={addMemberLoading}
            addMemberError={addMemberError}
            addMemberMessage={addMemberMessage}
            memberPermissionsDraft={memberPermissionsDraft}
            memberPermissionsLoading={memberPermissionsLoading}
            memberPermissionsSaving={memberPermissionsSaving}
            memberPermissionsError={memberPermissionsError}
            memberPermissionsMessage={memberPermissionsMessage}
            getChatTitle={getChatTitle}
            getChatMemberDisplayName={getChatMemberDisplayName}
            onCloseTopmost={() => {
              if (chatInfoAddingMember || chatInfoManaging) {
                setChatInfoAddingMember(false);
                setChatInfoManaging(false);
                return;
              }

              setChatInfoOpen(false);
              setChatInfoError(null);
            }}
            onClose={() => {
              setChatInfoOpen(false);
              setChatInfoError(null);
              setChatInfoAddingMember(false);
              setChatInfoManaging(false);
            }}
            onOpenManage={() => {
              setChatInfoManaging(true);
              setChatInfoAddingMember(false);
              void loadMemberDefaultPermissions(activeChat.id);
            }}
            onOpenAddMember={() => {
              openAddMemberPanel();
            }}
            onCloseAddMember={() => setChatInfoAddingMember(false)}
            onCloseManage={() => setChatInfoManaging(false)}
            onUpdateGroupProfile={updateActiveGroupProfile}
            onDeleteGroup={deleteActiveGroupForEveryone}
            onViewMemberProfile={(member) => {
              setSelectedContactProfile(toUserProfile(member));
            }}
            onOpenMemberManagement={(member, mode) => {
              openChatMemberProfile(member);
              setSelectedMemberManagementMode(mode);
            }}
            onStartRemoveMember={startRemovingMember}
            onAddMemberTag={addMemberTag}
            onAddMemberQueryChange={updateAddMemberQuery}
            onAddMemberSubmit={handleAddMemberToActiveGroup}
            onMemberBooleanPermissionChange={updateMemberBooleanPermission}
            onMemberNumericPermissionChange={updateMemberNumericPermission}
            onSaveMemberDefaultPermissions={() => {
              void saveMemberDefaultPermissions();
            }}
            onLeaveGroup={() => openLeaveGroupDialog(activeChat)}
          />
        ) : null}

        {selectedContactProfile ? (
          <UserProfileDialog
            profile={selectedContactProfile}
            isContact={isContact(selectedContactProfile.id)}
            contactActionLoading={
              contactSavingUserId === selectedContactProfile.id
            }
            isBlocked={isBlocked(selectedContactProfile.id)}
            blockActionLoading={
              blockingUserId === selectedContactProfile.id
            }
            onClose={() => setSelectedContactProfile(null)}
            onMessage={() => {
              setSelectedContactProfile(null);
              void openDraftChat(selectedContactProfile);
            }}
            onToggleContact={() => {
              void toggleContact(selectedContactProfile.id);
            }}
            onToggleBlock={() => {
              void toggleBlock(selectedContactProfile.id);
            }}
          />
        ) : null}

        {selectedDirectProfile ? (
          <UserProfileDialog
            profile={selectedDirectProfile}
            isContact={isContact(selectedDirectProfile.id)}
            contactActionLoading={
              contactSavingUserId === selectedDirectProfile.id
            }
            isBlocked={isBlocked(selectedDirectProfile.id)}
            blockActionLoading={blockingUserId === selectedDirectProfile.id}
            onClose={() => setSelectedChatMember(null)}
            onMessage={() => {
              setSelectedChatMember(null);
              void openDraftChat(selectedDirectProfile);
            }}
            onToggleContact={() => {
              void toggleContact(selectedDirectProfile.id);
            }}
            onToggleBlock={() => {
              void toggleBlock(selectedDirectProfile.id);
            }}
          />
        ) : null}

        {selectedChatMember && activeChat?.type !== "direct" ? (
          <MemberProfileDialog
            member={selectedChatMember}
            currentUserId={user.userId}
            showManagement={activeChat?.type === "group"}
            mode={selectedMemberManagementMode}
            adminPermissionsLoading={
              adminPermissionsLoadingUserId === selectedChatMember.user_id
            }
            hasActions={hasSelectedMemberManagementActions}
            canPromoteMember={canPromoteSelectedMember}
            canEditAdmin={canEditSelectedAdmin}
            canEditMemberPermissions={canEditSelectedMemberPermissions}
            canRemoveMember={canRemoveSelectedMember}
            memberPermissions={memberPermissions}
            memberPermissionsDraft={memberPermissionsDraft}
            selectedMemberPermissionsDraft={selectedMemberPermissionsDraft}
            selectedMemberPermissionsSaving={selectedMemberPermissionsSaving}
            selectedMemberPermissionsError={selectedMemberPermissionsError}
            selectedMemberPermissionsMessage={selectedMemberPermissionsMessage}
            selectedAdminPermissions={selectedAdminPermissions}
            selectedMemberPermissionIsSaving={selectedMemberPermissionIsSaving}
            selectedMemberRemovalIsSaving={selectedMemberRemovalIsSaving}
            adminPermissionsError={adminPermissionsError}
            adminPermissionsMessage={adminPermissionsMessage}
            memberRemovalError={memberRemovalError}
            memberRemovalMessage={memberRemovalMessage}
            memberPermissionIsLockedByDefault={memberPermissionIsLockedByDefault}
            adminPermissionIsForcedByMemberDefault={
              adminPermissionIsForcedByMemberDefault
            }
            getChatMemberDisplayName={getChatMemberDisplayName}
            onClose={() => setSelectedChatMember(null)}
            onModeChange={setSelectedMemberManagementMode}
            onSelectedMemberBooleanPermissionChange={
              updateSelectedMemberBooleanPermission
            }
            onSelectedMemberNumericPermissionChange={
              updateSelectedMemberNumericPermission
            }
            onAdminPermissionChange={updateAdminPermission}
            onSaveSelectedMemberPermissions={() => {
              void saveSelectedMemberPermissions();
            }}
            onPromoteSelectedMember={() => {
              void promoteSelectedMember();
            }}
            onSaveSelectedAdminPermissions={() => {
              void saveSelectedAdminPermissions();
            }}
            onDismissSelectedAdmin={dismissSelectedAdmin}
            onStartRemoveMember={() => {
              startRemovingMember(selectedChatMember);
            }}
            onViewPromoterProfile={(profile) => {
              setSelectedChatMember(null);
              setSelectedContactProfile(profile);
            }}
          />
        ) : null}

        {attachmentDrafts.length > 0 || editingAttachmentMessage ? (
          <AttachmentPreviewDialog
            mode={attachmentEditTarget ? "edit" : "send"}
            drafts={attachmentDrafts}
            caption={attachmentCaption}
            error={attachmentError}
            sending={
              attachmentEditTarget ? attachmentEditSaving : fileSending
            }
            onCaptionChange={setAttachmentCaption}
            onRemoveDraft={(draftId) =>
              removeAttachmentDraft(draftId, {
                preserveCaption: Boolean(editingAttachmentMessage),
              })
            }
            onPasteImages={handlePasteImages}
            onAddMore={() => fileInputRef.current?.click()}
            onCancel={() => {
              if (editingAttachmentMessage) {
                cancelAttachmentEdit();
                return;
              }

              clearAttachmentDrafts();
            }}
            onSend={() => {
              if (attachmentEditTarget) {
                void saveAttachmentEdit(attachmentEditTarget);
                return;
              }

              void sendAttachmentDrafts();
            }}
          />
        ) : null}

        {memberRemovalCandidate ? (
          <MemberRemovalDialog
            member={memberRemovalCandidate}
            removing={memberRemovalUserId === memberRemovalCandidate.user_id}
            getDisplayName={getChatMemberDisplayName}
            onCancel={cancelRemovingMember}
            onConfirm={() => {
              void removeSelectedChatMember(memberRemovalCandidate);
            }}
          />
        ) : null}

        {messageActionDialog && actionDialogEntry && actionDialogChat ? (
          <MessageActionDialog
            dialog={messageActionDialog}
            chat={actionDialogChat}
            currentUserId={user.userId}
            otherUserDisplayName={actionDialogOtherUserDisplayName}
            alsoForOtherUser={actionAlsoForOtherUser}
            onAlsoForOtherUserChange={setActionAlsoForOtherUser}
            onClose={closeMessageActionDialog}
            onConfirmPin={confirmPinAction}
            onConfirmDelete={confirmDeleteAction}
          />
        ) : null}

        {chatDeleteTarget ? (
          <DeleteChatDialog
            chat={chatDeleteTarget.chat}
            clearHistory={
              chatDeleteTarget.action === "clear" ||
              (chatDeleteTarget.chat.type === "group" &&
                chatDeleteTarget.chat.member_count >= 2)
            }
            deleting={chatDeleting}
            deleteMessagesForEveryone={deleteChatMessagesForEveryone}
            onDeleteMessagesForEveryoneChange={
              setDeleteChatMessagesForEveryone
            }
            onClose={closeChatDeleteDialog}
            onConfirm={() => {
              void confirmChatDelete();
            }}
          />
        ) : null}

        {groupLeaveTarget ? (
          <LeaveGroupDialog
            leaving={groupLeaving}
            onClose={closeLeaveGroupDialog}
            onConfirm={() => {
              void confirmLeaveGroup();
            }}
          />
        ) : null}

        {imageViewer ? (
          <ImageViewerDialog
            src={imageViewer.src}
            alt={imageViewer.alt}
            entry={imageViewer.entry}
            attachmentIndex={imageViewer.attachmentIndex}
            canDelete={canDeleteViewerMessage(imageViewer.entry)}
            onClose={() => setImageViewer(null)}
            onGoToMessage={(entry) => {
              setImageViewer(null);
              requestAnimationFrame(() => revealMessageById(entry.id));
            }}
            onCopyImage={(entry, attachmentIndex) => {
              void copyViewerImage(entry, attachmentIndex);
            }}
            onDelete={(entry) => {
              setImageViewer(null);
              openMessageActionDialog("delete", entry);
            }}
          />
        ) : null}

        {showChatSelectionPlaceholder ? (
          <div className="chat-selection-placeholder">
            Select a chat to start messaging
          </div>
        ) : (
          <>
            {chatError ? (
              <p className="profile-error">{chatError}</p>
            ) : null}

            {isMessagingBlocked ? (
              <div className="direct-message-blocked-notice" role="status">
                <Ban size={17} aria-hidden="true" />
                <span>This user blocked you from messaging them.</span>
              </div>
            ) : null}

            <MessageList
              messagesRef={messagesRef}
              messages={visibleMessages}
              isLoading={messagesLoading}
              currentUserId={user.userId}
              unreadSeparatorLastReadMessageId={unreadSeparatorLastReadMessageId}
              activeChat={activeChat}
              activeSearchResultId={activeSearchResultId}
              openMessageMenuId={openMessageMenuId}
              messageMenuPosition={messageMenuPosition}
              messageMenuCopyTarget={messageMenuCopyTarget}
              currentUserCanDeleteGroupMessages={currentUserCanDeleteGroupMessages}
              renderMessageBody={(entry) => (
                <MessageBody
                  entry={entry}
                  searchQuery={messageSearchQuery}
                  activeSearchResultId={activeSearchResultId}
                  onOpenImage={(src, alt, attachmentIndex) =>
                    setImageViewer({ src, alt, entry, attachmentIndex })
                  }
                />
              )}
              renderReplyPreview={(reply) => (
                <MessageReplyPreviewButton
                  reply={reply}
                  getSenderName={getReplySenderName}
                  onRevealMessage={revealMessageById}
                />
              )}
              getSenderAvatar={getSenderAvatar}
              getMessageDeliveryStatus={getMessageDeliveryStatus}
              onOpenMessageMenu={openMessageMenu}
              onCopyMessage={(entry, copyTarget) => {
                void copyMessage(entry, copyTarget);
              }}
              onStartReply={startReplyingToMessage}
              onStartEdit={startEditingMessageFromMenu}
              onOpenActionDialog={openMessageActionDialog}
            />

            <ChatComposer
              fileInputRef={fileInputRef}
              messageInputRef={messageInputRef}
              activeChatId={activeChatId}
              hasDraftRecipient={draftRecipient !== null}
              isMessagingBlocked={isMessagingBlocked}
              canSendTextMessages={canSendTextMessages}
              message={composerEditingMessage ? editingMessageText : message}
              editingMessage={composerEditingMessage}
              editingMessageSaving={editingMessageSaving}
              replyToMessage={replyToMessage}
              voiceRecorder={voiceRecorder}
              voiceRecordingElapsedMs={voiceRecordingElapsedMs}
              fileSending={fileSending}
              voiceSending={voiceSending}
              onFileInputChange={handleComposerFileInputChange}
              onPasteImages={handlePasteImages}
              onRevealMessage={revealMessageById}
              onCancelReply={() => setReplyToMessage(null)}
              onCancelEdit={cancelEditingMessage}
              onCancelVoiceRecording={() => {
                void stopVoiceRecording(false);
              }}
              onSendVoiceRecording={() => {
                void stopVoiceRecording(true);
              }}
              onMessageChange={(value) => {
                if (composerEditingMessage) {
                  setEditingMessageText(value);
                  return;
                }

                handleMessageInputChange(value);
              }}
              onSend={() => {
                if (composerEditingMessage) {
                  void saveMessageEdit(composerEditingMessage);
                  return;
                }

                sendTextMessage();
              }}
              onStartVoiceRecording={() => {
                void startVoiceRecording();
              }}
              getSenderName={getSenderName}
            />
            {status !== "Connected" ? (
              <div className="connection-retry">
                {connectionError ? (
                  <p className="status-copy">{connectionError}</p>
                ) : null}
                <button className="retry-button" onClick={retrySocketConnection}>
                  Retry connection
                </button>
              </div>
            ) : null}
          </>
        )}
            </>
          )}
        </section>
      </div>
      {editingProfile ? (
        <div
          className="profile-editor-backdrop"
          role="presentation"
          onClick={requestCloseProfileEditor}
        >
          <ProfileEditor
            username={user.username}
            firstName={profileFirstName}
            lastName={profileLastName}
            bio={profileBio}
            avatarPreviewUrl={profileAvatarPreviewUrl}
            saving={profileSaving}
            error={profileSaveError}
            message={profileSaveMessage}
            onFirstNameChange={setProfileFirstName}
            onLastNameChange={setProfileLastName}
            onBioChange={setProfileBio}
            onAvatarFileChange={setProfileAvatarFile}
            onClose={requestCloseProfileEditor}
            onSubmit={handleProfileUpdate}
          />
        </div>
      ) : null}
      {profileCloseConfirmOpen ? (
        <div
          className="message-action-backdrop"
          role="presentation"
          onClick={cancelProfileCloseConfirm}
        >
          <section
            className="message-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved profile changes"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="message-action-dialog-copy">
              <strong>There are unsaved changes.</strong>
              <p>Do you want to save them before exiting?</p>
            </div>
            <div className="message-action-dialog-actions">
              <button
                type="button"
                className="text-action-button"
                disabled={profileSaving}
                onClick={cancelProfileCloseConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={profileSaving}
                onClick={discardProfileChanges}
              >
                Don&apos;t save
              </button>
              <button
                type="button"
                className="text-action-button"
                disabled={profileSaving}
                onClick={() => {
                  void saveAndCloseProfileEditor();
                }}
              >
                {profileSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
