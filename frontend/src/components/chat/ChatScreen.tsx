import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import type { Socket } from "socket.io-client";

import { AttachmentPreviewDialog } from "@/components/chat/AttachmentPreviewDialog";
import { ChatAccountRail } from "@/components/chat/ChatAccountRail";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { CreateGroupPanel } from "@/components/chat/CreateGroupPanel";
import { GroupInfoPanel } from "@/components/chat/GroupInfoPanel";
import { ImageViewerDialog } from "@/components/chat/ImageViewerDialog";
import { MemberProfileDialog } from "@/components/chat/MemberProfileDialog";
import { MemberRemovalDialog } from "@/components/chat/MemberRemovalDialog";
import { MessageActionDialog } from "@/components/chat/MessageActionDialog";
import { MessageBody } from "@/components/chat/MessageBody";
import { MessageList } from "@/components/chat/MessageList";
import { MessageReplyPreviewButton } from "@/components/chat/MessageReplyPreviewButton";
import { MessageSearch } from "@/components/chat/MessageSearch";
import { PinnedMessagesBar } from "@/components/chat/PinnedMessagesBar";
import { ProfileEditor } from "@/components/chat/ProfileEditor";
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
import type {
  AuthResponse,
  AuthUser,
  Chat,
  ChatMessage,
  ThemeMode,
  UserProfile,
} from "@/types";

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
  const [chatError, setChatError] = useState<string | null>(
    null,
  );
  const [profileCloseConfirmOpen, setProfileCloseConfirmOpen] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<{
    src: string;
    alt: string;
    entry: ChatMessage;
    attachmentIndex: number;
  } | null>(null);
  const [editingAttachmentMessage, setEditingAttachmentMessage] =
    useState<ChatMessage | null>(null);
  const [attachmentEditSaving, setAttachmentEditSaving] = useState(false);
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
    saveActiveChatId,
    getSavedActiveChatId,
    clearSavedActiveChat,
    saveChatScrollPosition,
    getSavedChatScrollPosition,
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
    socketRef,
    setChats,
    setMessages,
    setActiveChatId,
    applyLocalReadState,
    prepareMessageScroll,
    getSavedActiveChatId,
    getSavedChatScrollPosition,
    saveActiveChatId,
    restoreComposerDraft,
    restoreEditDraft,
    onSessionExpired,
    onError: setChatError,
  });
  const {
    applyMessageUpdate,
    removeMessageLocally,
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
    saveActiveChatId,
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
    refreshChats,
    emitTypingStoppedBeforeDisconnect,
    clearUserActivity,
    handleTypingActivity,
    handleRecordingVoiceActivity,
    clearChatActivity,
    handleMembersRemoved,
    clearRemovedMembers,
    clearChatReadState,
    clearSavedActiveChat,
    resetChatInfoPanel,
    clearMemberRemoval,
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
    chatHeaderAvatar,
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

  const revealMessageById = (messageId: number) => {
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
      if (draft.existingFileUrl) {
        formData.append("existing_file_urls", draft.existingFileUrl);
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

  const copyMessage = async (entry: ChatMessage) => {
    closeMessageMenu();
    setChatError(null);

    try {
      await copyMessageToClipboard(entry);
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

  return (
    <main className="chat-shell">
      <div className="chat-layout">
        <ChatAccountRail
          user={user}
          themeMode={themeMode}
          onToggleProfileEditor={openProfileEditor}
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
            onMessageProfile={(profile) => {
              void openDraftChat(profile);
            }}
            onJoinChat={joinChat}
            onToggleChatPin={(chat) => {
              void toggleChatPin(chat);
            }}
            onReorderPinnedChats={(chatIds) => {
              void reorderPinnedChats(chatIds);
            }}
            getChatTitle={getChatTitle}
            getChatSubtitle={getChatSubtitle}
            onOpenCreateGroup={openCreateGroup}
          />
        )}
        <section className="chat-card">
          <div className="chat-top-stack">
            <ChatHeader
              title={chatHeaderTitle}
              subtitle={chatHeaderSubtitle}
              avatarUrl={chatHeaderAvatar}
              clickable={chatHeaderClickable}
              onClick={handleChatHeaderClick}
              searchEnabled={activeChatId !== null && draftRecipient === null}
              searchActive={messageSearchOpen}
              onSearchClick={() => {
                if (activeChatId === null || draftRecipient !== null) {
                  return;
                }

                setMessageSearchOpen((current) => {
                  if (current) {
                    resetMessageSearch();
                  }
                  return !current;
                });
              }}
            />
            {!creatingGroup ? (
              <PinnedMessagesBar
                messages={visibleMessages}
                canUnpinMessage={canUnpinPinnedBarMessage}
                onRequestUnpin={(entry) => {
                  openMessageActionDialog("pin", entry);
                }}
                onRevealMessage={revealMessageById}
              />
            ) : null}
          </div>

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
            user={user}
            members={chatInfoMembers}
            loading={chatInfoLoading}
            error={chatInfoError}
            isAddingMember={chatInfoAddingMember}
            isManaging={chatInfoManaging}
            canManageMembers={currentUserCanRemoveGroupMembers}
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
            }}
            onOpenAddMember={() => {
              openAddMemberPanel();
            }}
            onCloseAddMember={() => setChatInfoAddingMember(false)}
            onCloseManage={() => setChatInfoManaging(false)}
            onOpenMemberProfile={openChatMemberProfile}
            onStartRemoveMember={startRemovingMember}
            onAddMemberQueryChange={updateAddMemberQuery}
            onAddMemberSubmit={handleAddMemberToActiveGroup}
            onMemberBooleanPermissionChange={updateMemberBooleanPermission}
            onMemberNumericPermissionChange={updateMemberNumericPermission}
            onSaveMemberDefaultPermissions={() => {
              void saveMemberDefaultPermissions();
            }}
          />
        ) : null}

        {selectedChatMember ? (
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
            onDismissSelectedAdmin={() => {
              void dismissSelectedAdmin();
            }}
            onStartRemoveMember={() => {
              startRemovingMember(selectedChatMember);
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

        {chatError ? (
          <p className="profile-error">{chatError}</p>
        ) : null}

        <MessageList
          messagesRef={messagesRef}
          messages={visibleMessages}
          currentUserId={user.userId}
          activeChat={activeChat}
          activeSearchResultId={activeSearchResultId}
          openMessageMenuId={openMessageMenuId}
          messageMenuPosition={messageMenuPosition}
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
          onCopyMessage={(entry) => {
            void copyMessage(entry);
          }}
          onStartReply={startReplyingToMessage}
          onStartEdit={startEditingMessageFromMenu}
          onOpenActionDialog={openMessageActionDialog}
        />

        <ChatComposer
          fileInputRef={fileInputRef}
          activeChatId={activeChatId}
          hasDraftRecipient={draftRecipient !== null}
          message={
            composerEditingMessage ? editingMessageText : message
          }
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
        </section>
      </div>
      {editingProfile ? (
        <div className="profile-editor-backdrop">
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
