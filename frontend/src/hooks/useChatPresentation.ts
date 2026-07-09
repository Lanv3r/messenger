import type {
  AuthUser,
  Chat,
  MessageActionDialogState,
  UserProfile,
} from "@/types";

type UseChatPresentationOptions = {
  user: AuthUser;
  chats: Chat[];
  activeChat: Chat | undefined;
  draftRecipient: UserProfile | null;
  messageActionDialog: MessageActionDialogState | null;
  getChatActivitySubtitle: (chat: Chat | undefined) => string | null;
};

function getProfileDisplayName(profile: UserProfile) {
  return `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`;
}

export function useChatPresentation({
  user,
  chats,
  activeChat,
  draftRecipient,
  messageActionDialog,
  getChatActivitySubtitle,
}: UseChatPresentationOptions) {
  function getChatTitle(chat: Chat) {
    return chat.display_title || chat.title || "Chat";
  }

  function getChatSubtitle(chat: Chat) {
    const activitySubtitle = getChatActivitySubtitle(chat);
    if (activitySubtitle) {
      return activitySubtitle;
    }

    if (chat.last_message_text) {
      const prefix =
        chat.last_message_sender_id === user.userId ? "You: " : "";

      return `${prefix}${chat.last_message_text}`;
    }

    if (chat.type === "self") {
      return "Private notes";
    }

    if (chat.type === "direct") {
      return "Direct message";
    }

    return chat.type;
  }

  const chatHeaderTitle = draftRecipient
    ? getProfileDisplayName(draftRecipient)
    : activeChat
      ? getChatTitle(activeChat)
      : "Chat";
  const chatHeaderAvatar = draftRecipient
    ? draftRecipient.avatar_url
    : activeChat
      ? activeChat.display_avatar_url || activeChat.avatar_url || "/favicon.svg"
      : "/favicon.svg";
  const chatActivitySubtitle = getChatActivitySubtitle(activeChat);
  const chatHeaderSubtitle =
    chatActivitySubtitle ??
    (draftRecipient
      ? `@${draftRecipient.username}`
      : activeChat?.type === "group"
        ? `${activeChat.member_count} ${
            activeChat.member_count === 1 ? "member" : "members"
          }`
        : activeChat?.type === "direct"
          ? ""
          : activeChat?.type === "self"
            ? "Private notes"
            : "Select a chat");
  const chatHeaderClickable =
    Boolean(activeChat) &&
    activeChat?.type !== "self" &&
    draftRecipient === null;

  const actionDialogEntry = messageActionDialog?.entry ?? null;
  const actionDialogChat = actionDialogEntry
    ? activeChat?.id === actionDialogEntry.chat_id
      ? activeChat
      : chats.find((chat) => chat.id === actionDialogEntry.chat_id)
    : null;
  const actionDialogOtherUserDisplayName =
    actionDialogChat?.type === "direct"
      ? getChatTitle(actionDialogChat)
      : "the other user";

  return {
    getChatTitle,
    getChatSubtitle,
    chatHeaderTitle,
    chatHeaderAvatar,
    chatHeaderSubtitle,
    chatHeaderClickable,
    actionDialogEntry,
    actionDialogChat,
    actionDialogOtherUserDisplayName,
  };
}
