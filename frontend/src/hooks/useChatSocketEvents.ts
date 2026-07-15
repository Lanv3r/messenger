import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Socket } from "socket.io-client";

import {
  mergeChatMembershipUpdate,
  updateChatPreviewWithUnread,
  upsertChat,
} from "@/lib/chat-helpers";
import type {
  Chat,
  ChatMessagesDeletedEvent,
  ChatMember,
  ChatMembersUpdatedEvent,
  ChatMessage,
  ChatPermissionsUpdatedEvent,
  ChatReadEvent,
  ChatRecordingVoiceEvent,
  ChatTypingEvent,
  ChatUpdatedEvent,
  DirectMessageAccessUpdatedEvent,
  MessageDeletedEvent,
  MessagePinUpdatedEvent,
  RemovedFromChatEvent,
  UserProfile,
} from "@/types";

type UseChatSocketEventsOptions = {
  userId: number;
  activeChatIdRef: MutableRefObject<number | null>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setMessageSearchResults: Dispatch<SetStateAction<ChatMessage[]>>;
  setActiveChatId: Dispatch<SetStateAction<number | null>>;
  setDraftRecipient: Dispatch<SetStateAction<UserProfile | null>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setReplyToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setSelectedChatMember: Dispatch<SetStateAction<ChatMember | null>>;
  applyLocalReadState: (chat: Chat) => Chat;
  applyMessageUpdate: (message: ChatMessage) => void;
  removeMessageLocally: (messageId: number, chatId: number) => void;
  removeMessagesLocally: (messageIds: number[], chatId: number) => void;
  refreshChats: () => void;
  refreshChatPermissions: (chatId: number) => void;
  emitTypingStoppedBeforeDisconnect: (socket: Socket) => void;
  clearUserActivity: (
    chatId: number,
    userId: number | null,
    username: string | null,
  ) => void;
  handleTypingActivity: (data: ChatTypingEvent) => void;
  handleRecordingVoiceActivity: (data: ChatRecordingVoiceEvent) => void;
  clearChatActivity: () => void;
  handleMembersRemoved: (memberIds: number[]) => void;
  clearRemovedMembers: (memberIds: number[]) => void;
  clearChatReadState: (chatId: number) => void;
  resetChatInfoPanel: () => void;
  clearMemberRemoval: () => void;
  onIncomingActiveChatMessage: (message: ChatMessage) => void;
  onChatError: (message: string) => void;
};

export function useChatSocketEvents({
  userId,
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
  onIncomingActiveChatMessage,
  onChatError,
}: UseChatSocketEventsOptions) {
  function onBeforeDisconnect(socket: Socket) {
    emitTypingStoppedBeforeDisconnect(socket);
  }

  function onMessage(data: ChatMessage) {
    if (data.chat_id === activeChatIdRef.current && data.sender_id !== userId) {
      onIncomingActiveChatMessage(data);
    }

    setMessages((current) => {
      if (current.some((entry) => entry.id === data.id)) {
        return current;
      }

      return [
        ...current,
        { ...data, isOwn: data.sender_id === userId },
      ];
    });
    setChats((current) => updateChatPreviewWithUnread(current, data, userId));
    clearUserActivity(data.chat_id, data.sender_id, data.sender_username);
  }

  function onChatUpdated(data: ChatUpdatedEvent) {
    setChats((current) =>
      updateChatPreviewWithUnread(current, data.last_message, userId),
    );
    clearUserActivity(
      data.chat_id,
      data.last_message.sender_id,
      data.last_message.sender_username,
    );
    if (
      data.chat_id === activeChatIdRef.current &&
      data.last_message.sender_id !== userId
    ) {
      onIncomingActiveChatMessage(data.last_message);
      setMessages((current) => {
        if (current.some((entry) => entry.id === data.last_message.id)) {
          return current;
        }

        return [
          ...current,
          {
            ...data.last_message,
            isOwn: false,
          },
        ];
      });
    }

    void refreshChats();
  }

  function onChatCreated(data: Chat) {
    setChats((current) => upsertChat(current, applyLocalReadState(data)));
    void refreshChats();
  }

  function onChatMembersUpdated(data: ChatMembersUpdatedEvent) {
    setChats((current) => {
      const existingChat = current.find((chat) => chat.id === data.chat.id);
      const updatedChat = mergeChatMembershipUpdate(
        existingChat,
        data.chat,
      );

      return upsertChat(current, applyLocalReadState(updatedChat));
    });

    if (
      data.chat.id === activeChatIdRef.current &&
      data.removed_member_ids?.length
    ) {
      handleMembersRemoved(data.removed_member_ids);
      clearRemovedMembers(data.removed_member_ids);
    }
  }

  function onChatPermissionsUpdated(data: ChatPermissionsUpdatedEvent) {
    refreshChatPermissions(data.chat_id);
    void refreshChats();
  }

  function onRemovedFromChat(data: RemovedFromChatEvent, socket: Socket) {
    setChats((current) =>
      current.filter((chat) => chat.id !== data.chat_id),
    );

    clearChatReadState(data.chat_id);

    if (activeChatIdRef.current !== data.chat_id) {
      return;
    }

    socket.emit("leave_room", String(data.chat_id));
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setDraftRecipient(null);
    setMessages([]);
    setMessage("");
    setReplyToMessage(null);
    resetChatInfoPanel();
    setSelectedChatMember(null);
    clearMemberRemoval();
    if (!data.left_by_self) {
      onChatError("You were removed from this group.");
    }
  }

  function onMessagePinUpdated(data: MessagePinUpdatedEvent) {
    const updateMessage = (entry: ChatMessage) =>
      entry.id === data.message_id && entry.chat_id === data.chat_id
        ? {
            ...entry,
            pinned_at: data.pinned_at,
            pinned_by: data.pinned_by,
          }
        : entry;

    setMessages((current) => current.map(updateMessage));
    setMessageSearchResults((current) => current.map(updateMessage));
  }

  function onMessageUpdated(data: ChatMessage) {
    applyMessageUpdate(data);
  }

  function onMessageDeleted(data: MessageDeletedEvent) {
    removeMessageLocally(data.message_id, data.chat_id);
    void refreshChats();
  }

  function onChatMessagesDeleted(data: ChatMessagesDeletedEvent) {
    removeMessagesLocally(data.message_ids, data.chat_id);
    void refreshChats();
  }

  function onChatRead(data: ChatReadEvent) {
    if (data.user_id === userId) {
      return;
    }

    setChats((current) =>
      current.map((chat) =>
        chat.id === data.chat_id
          ? {
              ...chat,
              other_last_read_message_id: data.last_read_message_id,
              other_last_read_at: data.last_read_at,
            }
          : chat,
      ),
    );

    void refreshChats();
  }

  function onDirectMessageAccessUpdated(
    data: DirectMessageAccessUpdatedEvent,
  ) {
    setChats((current) =>
      current.map((chat) =>
        chat.type === "direct" && chat.other_user_id === data.other_user_id
          ? { ...chat, is_blocked_by_other: data.is_blocked_by_other }
          : chat,
      ),
    );
  }

  return {
    onBeforeDisconnect,
    onMessage,
    onChatUpdated,
    onChatCreated,
    onChatMembersUpdated,
    onChatPermissionsUpdated,
    onRemovedFromChat,
    onMessagePinUpdated,
    onMessageUpdated,
    onMessageDeleted,
    onChatMessagesDeleted,
    onChatRead,
    onDirectMessageAccessUpdated,
    onTyping: handleTypingActivity,
    onRecordingVoice: handleRecordingVoiceActivity,
    onDisconnected: clearChatActivity,
  };
}
