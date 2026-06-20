import { Fragment, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, ClockArrowUp, Pin } from "lucide-react";
import { io, Socket } from "socket.io-client";

import { API_URL, apiFetch } from "@/lib/api";
import Login from "@/Login";
import Signup from "@/Signup";
import { Button } from "@/components/ui/button";
import "./App.css";

type ChatMessage = {
  id: number;
  chat_id: number;
  sender_id: number | null;
  sender_username: string | null;
  sender_avatar_url?: string | null;
  content: string | null;
  message_type: string;
  reply_to_message_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  pinned_at: string | null;
  pinned_by: number | null;
  is_pinned_for_me: boolean;
  metadata?: Record<string, unknown>;
  isOwn?: boolean;
  delivery_status?: "sending" | "sent" | "read" | "failed";
  temp_id?: string;
};

type AuthUser = {
  userId: number;
  username: string;
  firstName: string;
  lastName: string | null;
  bio: string | null;
  avatarUrl: string;
  status: string;
};

type AuthResponse = {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  bio?: string | null;
  avatar_url?: string;
  status?: string;
};

type UserProfile = AuthResponse & {
  bio: string | null;
  avatar_url: string;
  status: string;
};

type ChatMember = {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  bio: string | null;
  avatar_url: string;
  status: string;
  role: string;
  joined_at: string | null;
  added_by: number | null;
};

type MemberPermissionValue = boolean | number;
type MemberPermissions = Record<string, MemberPermissionValue>;
type AdminPermissions = Record<string, boolean>;

type Chat = {
  id: number;
  type: "self" | "direct" | "group" | string;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  display_title: string;
  display_avatar_url: string;
  other_user_id: number | null;
  member_ids: number[];
  member_count: number;
  current_user_role: string | null;
  last_message_id: number | null;
  last_message_text: string | null;
  last_message_sender_id: number | null;
  last_message_created_at: string | null;
  unread_count: number;
  is_pinned: boolean;
  current_last_read_message_id: number | null;
  other_last_read_message_id: number | null;
  other_last_read_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type DirectMessageResponse = {
  chat: Chat;
  message: ChatMessage;
};

type ChatReadEvent = {
  chat_id: number;
  user_id: number;
  last_read_message_id: number;
  last_read_at: string | null;
};

type ChatUpdatedEvent = {
  chat_id: number;
  last_message: ChatMessage;
};

type ChatMembersUpdatedEvent = {
  chat: Chat;
  added_member_ids: number[];
  added_by: number;
};

type MessagePinUpdatedEvent = {
  message_id: number;
  chat_id: number;
  pinned_at: string | null;
  pinned_by: number | null;
};

type MessageDeletedEvent = {
  message_id: number;
  chat_id: number;
};

type ChatSettingsResponse = {
  ok: boolean;
  chat_id: number;
  is_pinned: boolean;
  is_archived?: boolean;
  muted_until?: string | null;
};

const MEMBER_BOOLEAN_PERMISSION_KEYS = [
  "send_messages",
  "add_members",
  "pin_messages",
  "edit_own_tags",
  "change_group_info",
  "send_photos",
  "send_video_files",
  "send_video_messages",
  "send_music",
  "send_voice_messages",
  "send_files",
  "send_stickers_gifs",
  "embed_links",
  "send_polls",
  "send_reactions",
] as const;

const MEMBER_NUMERIC_PERMISSION_KEYS = ["slowmode_seconds"] as const;

const ADMIN_PERMISSION_KEYS = [
  "change_group_info",
  "delete_messages",
  "ban_users",
  "add_members",
  "pin_messages",
  "post_stories",
  "edit_others_stories",
  "delete_others_stories",
  "manage_video_chats",
  "edit_member_tags",
  "remain_anonymous",
  "manage_admins",
] as const;

const ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS = [
  "change_group_info",
  "add_members",
  "pin_messages",
] as const;

const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  change_group_info: true,
  delete_messages: true,
  ban_users: true,
  add_members: true,
  pin_messages: true,
  post_stories: false,
  edit_others_stories: false,
  delete_others_stories: false,
  manage_video_chats: true,
  edit_member_tags: true,
  remain_anonymous: false,
  manage_admins: false,
};

const PERMISSION_LABELS: Record<string, string> = {
  send_messages: "Send messages",
  add_members: "Add members",
  pin_messages: "Pin messages",
  edit_own_tags: "Edit own tags",
  change_group_info: "Change group info",
  send_photos: "Send photos",
  send_video_files: "Send video files",
  send_video_messages: "Send video messages",
  send_music: "Send music",
  send_voice_messages: "Send voice messages",
  send_files: "Send files",
  send_stickers_gifs: "Send stickers and GIFs",
  embed_links: "Embed links",
  send_polls: "Send polls",
  send_reactions: "Send reactions",
  slowmode_seconds: "Slow mode, seconds",
  delete_messages: "Delete others' messages",
  ban_users: "Ban users / manage member defaults",
  post_stories: "Post stories",
  edit_others_stories: "Edit others' stories",
  delete_others_stories: "Delete others' stories",
  manage_video_chats: "Manage video chats",
  edit_member_tags: "Edit member tags",
  remain_anonymous: "Remain anonymous",
  manage_admins: "Add or manage admins",
};

function buildDefaultAdminPermissions(
  memberPermissions: MemberPermissions | null,
): AdminPermissions {
  const permissions = { ...DEFAULT_ADMIN_PERMISSIONS };

  for (const key of ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS) {
    if (memberPermissions?.[key] === true) {
      permissions[key] = true;
    }
  }

  return permissions;
}

function enforceAdminMemberOverlaps(
  adminPermissions: AdminPermissions,
  memberPermissions: MemberPermissions | null,
): AdminPermissions {
  const permissions = { ...adminPermissions };

  for (const key of ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS) {
    if (memberPermissions?.[key] === true) {
      permissions[key] = true;
    }
  }

  return permissions;
}

function getChatSortTime(chat: Chat) {
  const value = chat.last_message_created_at ?? chat.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortChats(chats: Chat[]) {
  return [...chats].sort((first, second) => {
    const firstIsPinned = Boolean(first.is_pinned);
    const secondIsPinned = Boolean(second.is_pinned);

    if (firstIsPinned !== secondIsPinned) {
      return firstIsPinned ? -1 : 1;
    }

    return getChatSortTime(second) - getChatSortTime(first);
  });
}

function upsertChat(chats: Chat[], chat: Chat) {
  const existingIndex = chats.findIndex((item) => item.id === chat.id);

  if (existingIndex === -1) {
    return sortChats([chat, ...chats]);
  }

  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1, chat);
  return sortChats(nextChats);
}

function mergeChatMembershipUpdate(existingChat: Chat | undefined, chat: Chat) {
  if (!existingChat) {
    return chat;
  }

  return {
    ...existingChat,
    ...chat,
    last_message_id:
      chat.last_message_id ?? existingChat.last_message_id,
    last_message_text:
      chat.last_message_text ?? existingChat.last_message_text,
    last_message_sender_id:
      chat.last_message_sender_id ?? existingChat.last_message_sender_id,
    last_message_created_at:
      chat.last_message_created_at ?? existingChat.last_message_created_at,
    unread_count: existingChat.unread_count,
    current_last_read_message_id:
      existingChat.current_last_read_message_id,
    other_last_read_message_id:
      existingChat.other_last_read_message_id,
    other_last_read_at: existingChat.other_last_read_at,
    is_pinned: existingChat.is_pinned,
  };
}

function applyLastMessagePreview(
  chat: Chat,
  message: ChatMessage,
): Chat {
  return {
    ...chat,
    last_message_id: message.id,
    last_message_text: message.content,
    last_message_sender_id: message.sender_id,
    last_message_created_at: message.created_at,
    updated_at: message.updated_at ?? chat.updated_at,
  };
}

function upsertChatPreview(
  chats: Chat[],
  chat: Chat,
  message: ChatMessage,
) {
  const nextChat = applyLastMessagePreview(chat, message);
  const existingIndex = chats.findIndex(
    (item) => item.id === chat.id,
  );

  if (existingIndex === -1) {
    return sortChats([nextChat, ...chats]);
  }

  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1);
  return sortChats([nextChat, ...nextChats]);
}

function updateChatPreview(
  chats: Chat[],
  message: ChatMessage,
) {
  const existingChat = chats.find(
    (chat) => chat.id === message.chat_id,
  );

  if (!existingChat) {
    return chats;
  }

  return upsertChatPreview(chats, existingChat, message);
}

function replaceTemporaryMessage(
  messages: ChatMessage[],
  tempId: string,
  nextMessage: ChatMessage,
) {
  return messages.map((message) =>
    message.temp_id === tempId ? nextMessage : message,
  );
}

function getMessageTime(message: ChatMessage) {
  if (!message.created_at) {
    return 0;
  }

  const timestamp = new Date(message.created_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareMessages(first: ChatMessage, second: ChatMessage) {
  const timeDifference =
    getMessageTime(first) - getMessageTime(second);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return first.id - second.id;
}

function getVisibleMessages(
  messages: ChatMessage[],
  activeChatId: number | null,
) {
  if (activeChatId === null) {
    return [];
  }

  return messages
    .filter((entry) => entry.chat_id === activeChatId)
    .sort(compareMessages);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSearchExcerpt(content: string | null, query: string) {
  if (!content) {
    return "No message text";
  }

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return content;
  }

  const matchIndex = content.toLowerCase().indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return content;
  }

  const contextLength = 42;
  const matchEnd = matchIndex + normalizedQuery.length;
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(content.length, matchEnd + contextLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";

  return `${prefix}${content.slice(start, end)}${suffix}`;
}

function highlightSearchText(content: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return content;
  }

  const parts = content.split(
    new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi"),
  );

  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery ? (
      <mark className="message-search-match" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

function readNumberFromSessionStorage(key: string) {
  const value = window.sessionStorage.getItem(key);

  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function toAuthUser(authUser: AuthResponse): AuthUser {
  return {
    userId: authUser.id,
    username: authUser.username,
    firstName: authUser.first_name,
    lastName: authUser.last_name,
    bio: authUser.bio ?? null,
    avatarUrl: authUser.avatar_url ?? "/favicon.svg",
    status: authUser.status ?? "online",
  };
}

function ChatScreen({
  user,
  onSignOut,
  onSessionExpired,
  onUserUpdated,
}: {
  user: AuthUser;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting...");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(
    null,
  );
  const [profileQuery, setProfileQuery] = useState("");
  const [profileResult, setProfileResult] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState(user.firstName);
  const [profileLastName, setProfileLastName] = useState(user.lastName ?? "");
  const [profileBio, setProfileBio] = useState(user.bio ?? "");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(user.avatarUrl);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(
    null,
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [chatInfoOpen, setChatInfoOpen] = useState(false);
  const [chatInfoMembers, setChatInfoMembers] = useState<ChatMember[]>([]);
  const [selectedChatMember, setSelectedChatMember] =
    useState<ChatMember | null>(null);
  const [chatInfoLoading, setChatInfoLoading] = useState(false);
  const [chatInfoError, setChatInfoError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatarUrl, setGroupAvatarUrl] = useState("/favicon.svg");
  const [groupMemberQuery, setGroupMemberQuery] = useState("");
  const [groupSelectedMembers, setGroupSelectedMembers] = useState<
    UserProfile[]
  >([]);
  const [groupMemberLoading, setGroupMemberLoading] = useState(false);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [addMemberQuery, setAddMemberQuery] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberMessage, setAddMemberMessage] = useState<string | null>(null);
  const [memberPermissions, setMemberPermissions] =
    useState<MemberPermissions | null>(null);
  const [memberPermissionsDraft, setMemberPermissionsDraft] =
    useState<MemberPermissions | null>(null);
  const [memberPermissionsLoading, setMemberPermissionsLoading] =
    useState(false);
  const [memberPermissionsSaving, setMemberPermissionsSaving] =
    useState(false);
  const [memberPermissionsError, setMemberPermissionsError] =
    useState<string | null>(null);
  const [memberPermissionsMessage, setMemberPermissionsMessage] =
    useState<string | null>(null);
  const [adminPermissionsByUserId, setAdminPermissionsByUserId] = useState<
    Record<number, AdminPermissions>
  >({});
  const [adminPermissionsDraftByUserId, setAdminPermissionsDraftByUserId] =
    useState<Record<number, AdminPermissions>>({});
  const [adminPermissionsLoadingUserId, setAdminPermissionsLoadingUserId] =
    useState<number | null>(null);
  const [adminPermissionsSavingUserId, setAdminPermissionsSavingUserId] =
    useState<number | null>(null);
  const [adminPermissionsError, setAdminPermissionsError] =
    useState<string | null>(null);
  const [adminPermissionsMessage, setAdminPermissionsMessage] =
    useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<
    ChatMessage[]
  >([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState<string | null>(
    null,
  );
  const [messageSearchHasSearched, setMessageSearchHasSearched] =
    useState(false);
  const [activeSearchResultId, setActiveSearchResultId] = useState<
    number | null
  >(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(
    null,
  );
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessageSaving, setEditingMessageSaving] = useState(false);
  const messagesRef = useRef<HTMLUListElement | null>(null);
  const pendingMessageScrollRef = useRef<{
    chatId: number;
    lastReadMessageId: number | null;
    unreadCount: number;
    scrollTop?: number | null;
  } | null>(null);
  const readCoverageByChatRef = useRef<
    Record<number, { top: number; bottom: number }>
  >({});
  const lastReadMessageIdByChatRef = useRef<Record<number, number>>({});
  const unreadCountOverrideByChatRef = useRef<Record<number, number>>({});
  const socketRef = useRef<Socket | null>(null);
  const activeChat = chats.find(
    (chat) => chat.id === activeChatId,
  );

  function getChatSessionStorageKey(key: string) {
    return `messenger:${user.userId}:${key}`;
  }

  function getChatScrollSessionStorageKey(chatId: number) {
    return getChatSessionStorageKey(`chat:${chatId}:scrollTop`);
  }

  function saveActiveChatId(chatId: number) {
    window.sessionStorage.setItem(
      getChatSessionStorageKey("activeChatId"),
      String(chatId),
    );
  }

  function getSavedActiveChatId() {
    return readNumberFromSessionStorage(
      getChatSessionStorageKey("activeChatId"),
    );
  }

  function saveChatScrollPosition(chatId: number, scrollTop: number) {
    window.sessionStorage.setItem(
      getChatScrollSessionStorageKey(chatId),
      String(Math.max(0, Math.round(scrollTop))),
    );
  }

  function getSavedChatScrollPosition(chatId: number) {
    return readNumberFromSessionStorage(
      getChatScrollSessionStorageKey(chatId),
    );
  }

  function applyLocalReadState(chat: Chat) {
    const localLastReadMessageId =
      lastReadMessageIdByChatRef.current[chat.id];
    const unreadCountOverride =
      unreadCountOverrideByChatRef.current[chat.id];

    if (
      localLastReadMessageId === undefined ||
      localLastReadMessageId <= (chat.current_last_read_message_id ?? 0)
    ) {
      return unreadCountOverride === undefined
        ? chat
        : { ...chat, unread_count: unreadCountOverride };
    }

    return {
      ...chat,
      current_last_read_message_id: localLastReadMessageId,
      unread_count:
        unreadCountOverride ??
        (chat.last_message_id !== null &&
        localLastReadMessageId >= chat.last_message_id
          ? 0
          : chat.unread_count),
    };
  }

  function setLoadedChats(loadedChats: Chat[]) {
    setChats(sortChats(loadedChats.map(applyLocalReadState)));
  }

  async function refreshChats(
    fallbackMessage = "Unable to load chats.",
  ) {
    try {
      const loadedChats = await apiFetch<Chat[]>("/chats");
      setLoadedChats(loadedChats);
      setChatError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : fallbackMessage;

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    }
  }

  function applyMessageUpdate(updatedMessage: ChatMessage) {
    const nextMessage = {
      ...updatedMessage,
      isOwn: updatedMessage.sender_id === user.userId,
    };

    const updateMessage = (entry: ChatMessage) =>
      entry.id === updatedMessage.id &&
      entry.chat_id === updatedMessage.chat_id
        ? {
            ...entry,
            ...nextMessage,
            delivery_status: entry.delivery_status,
            temp_id: entry.temp_id,
          }
        : entry;

    setMessages((current) => current.map(updateMessage));
    setMessageSearchResults((current) => current.map(updateMessage));
    setChats((current) =>
      current.map((chat) =>
        chat.id === updatedMessage.chat_id &&
        chat.last_message_id === updatedMessage.id
          ? {
              ...chat,
              last_message_text: updatedMessage.content,
              last_message_sender_id: updatedMessage.sender_id,
              last_message_created_at: updatedMessage.created_at,
              updated_at: updatedMessage.updated_at ?? chat.updated_at,
            }
          : chat,
      ),
    );
  }

  function markChatReadThrough(
    chatId: number,
    messageId: number,
    options: {
      resetUnread?: boolean;
      unreadCountChange?: number;
    } = {},
  ) {
    const previousLastReadMessageId =
      lastReadMessageIdByChatRef.current[chatId] ?? 0;
    const nextLastReadMessageId = Math.max(
      previousLastReadMessageId,
      messageId,
    );

    lastReadMessageIdByChatRef.current[chatId] =
      nextLastReadMessageId;

    if (options.resetUnread) {
      unreadCountOverrideByChatRef.current[chatId] = 0;
    }

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== chatId) {
          return chat;
        }

        const nextUnreadCount = options.resetUnread
          ? 0
          : Math.max(
              0,
              chat.unread_count - (options.unreadCountChange ?? 0),
            );

        unreadCountOverrideByChatRef.current[chatId] =
          nextUnreadCount;

        return {
          ...chat,
          current_last_read_message_id: Math.max(
            chat.current_last_read_message_id ?? 0,
            nextLastReadMessageId,
          ),
          unread_count: nextUnreadCount,
        };
      }),
    );

    if (messageId <= previousLastReadMessageId) {
      return;
    }

    apiFetch<{ ok: boolean }>(`/chats/${chatId}/read`, {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        last_read_message_id: messageId,
      }),
    }).catch((error) => {
      if (
        error instanceof Error &&
        error.message === "Could not validate credentials"
      ) {
        onSessionExpired();
        return;
      }

      const message =
        error instanceof Error ? error.message : "Unable to mark chat read.";
      setChatError(message);
    });
  }

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (activeChatIdRef.current !== null) {
        socket.emit("join_room", String(activeChatIdRef.current));
      }
      setStatus("Connected");
      setConnectionError(null);
    });

    socket.on("message", (data: ChatMessage) => {
      setMessages((current) => {
        if (current.some((entry) => entry.id === data.id)) {
          return current;
        }

        return [
          ...current,
          { ...data, isOwn: data.sender_id === user.userId },
        ];
      });
      setChats((current) => updateChatPreview(current, data));
    });

    socket.on("chat_updated", (data: ChatUpdatedEvent) => {
      setChats((current) => updateChatPreview(current, data.last_message));
      if (
        data.chat_id === activeChatIdRef.current &&
        data.last_message.sender_id !== user.userId
      ) {
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

      apiFetch<Chat[]>("/chats")
        .then((loadedChats) => {
          setLoadedChats(loadedChats);
          setChatError(null);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to load chats.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setChatError(message);
        });
    });

    socket.on("chat_created", (data: Chat) => {
      setChats((current) =>
        upsertChat(current, applyLocalReadState(data)),
      );

      apiFetch<Chat[]>("/chats")
        .then((loadedChats) => {
          setLoadedChats(loadedChats);
          setChatError(null);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to load chats.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setChatError(message);
        });
    });

    socket.on("chat_members_updated", (data: ChatMembersUpdatedEvent) => {
      setChats((current) => {
        const existingChat = current.find((chat) => chat.id === data.chat.id);
        const updatedChat = mergeChatMembershipUpdate(
          existingChat,
          data.chat,
        );

        return upsertChat(current, applyLocalReadState(updatedChat));
      });
    });

    socket.on("message_pin_updated", (data: MessagePinUpdatedEvent) => {
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
    });

    socket.on("message_updated", (data: ChatMessage) => {
      applyMessageUpdate(data);
    });

    socket.on("message_deleted", (data: MessageDeletedEvent) => {
      setMessages((current) =>
        current.filter(
          (entry) =>
            entry.id !== data.message_id || entry.chat_id !== data.chat_id,
        ),
      );
      setMessageSearchResults((current) =>
        current.filter(
          (entry) =>
            entry.id !== data.message_id || entry.chat_id !== data.chat_id,
        ),
      );
      setActiveSearchResultId((current) =>
        current === data.message_id ? null : current,
      );
      setEditingMessageId((current) =>
        current === data.message_id ? null : current,
      );
      void refreshChats();
    });

    socket.on("chat_read", (data: ChatReadEvent) => {
      if (data.user_id === user.userId) {
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

      apiFetch<Chat[]>("/chats")
        .then((loadedChats) => {
          setLoadedChats(loadedChats);
          setChatError(null);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to load chats.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setChatError(message);
        });
    });

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        onSessionExpired();
        return;
      }

      setStatus(reason);
    });

    socket.on("connect_error", (error) => {
      if (
        ["Not authenticated", "Invalid token", "User not found"].some(
          (message) => error.message.includes(message),
        )
      ) {
        onSessionExpired();
        return;
      }

      setStatus("Connection failed");
      setConnectionError(error.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [onSessionExpired, user.userId]);

  useEffect(() => {
    async function loadChats() {
      try {
        const loadedChats =
          await apiFetch<Chat[]>("/chats");

        setLoadedChats(loadedChats);
        setChatError(null);

        if (loadedChats.length > 0) {
          const savedActiveChatId = getSavedActiveChatId();
          const restoredChat =
            savedActiveChatId === null
              ? null
              : loadedChats.find((chat) => chat.id === savedActiveChatId);
          const selectedChat =
            restoredChat ??
            loadedChats.find(
              (chat) => chat.type === "self",
            ) ??
            loadedChats[0];

          pendingMessageScrollRef.current = {
            chatId: selectedChat.id,
            lastReadMessageId: selectedChat.current_last_read_message_id,
            unreadCount: selectedChat.unread_count,
            scrollTop:
              restoredChat === null
                ? null
                : getSavedChatScrollPosition(selectedChat.id),
          };
          activeChatIdRef.current = selectedChat.id;
          saveActiveChatId(selectedChat.id);
          setActiveChatId(selectedChat.id);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load chats.";

        if (message === "Could not validate credentials") {
          onSessionExpired();
          return;
        }

        setChatError(message);
      }
    }

    loadChats();
  }, [onSessionExpired]);

  useEffect(() => {
    if (activeChatId === null) {
      setMessages([]);
      return;
    }

    const controller = new AbortController();

    async function loadMessages() {
      try {
        const chatMessages = await apiFetch<ChatMessage[]>(
          `/chats/${activeChatId}/messages`,
          {
            signal: controller.signal,
          },
        );

        setMessages(chatMessages);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      }
    }

    loadMessages();

    return () => {
      controller.abort();
    };
  }, [activeChatId]);

  useEffect(() => {
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError(null);
    setMessageSearchHasSearched(false);
    setActiveSearchResultId(null);
    setChatInfoOpen(false);
    setChatInfoMembers([]);
    setSelectedChatMember(null);
    setChatInfoError(null);
    setAddMemberQuery("");
    setAddMemberError(null);
    setAddMemberMessage(null);
    setMemberPermissions(null);
    setMemberPermissionsDraft(null);
    setMemberPermissionsError(null);
    setMemberPermissionsMessage(null);
    setAdminPermissionsByUserId({});
    setAdminPermissionsDraftByUserId({});
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessageSaving(false);
  }, [activeChatId, draftRecipient?.id]);

  useEffect(() => {
    const query = messageSearchQuery.trim();

    if (activeChatId === null || !query) {
      setMessageSearchResults([]);
      setMessageSearchError(null);
      setMessageSearchLoading(false);
      setMessageSearchHasSearched(false);
      return;
    }

    const controller = new AbortController();

    setMessageSearchLoading(true);
    setMessageSearchError(null);
    setMessageSearchHasSearched(true);

    const timeoutId = window.setTimeout(() => {
      apiFetch<ChatMessage[]>(
        `/chats/${activeChatId}/messages/search?query=${encodeURIComponent(query)}`,
        {
          signal: controller.signal,
        },
      )
        .then((results) => {
          setMessageSearchResults(results);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setMessageSearchResults([]);

          const message =
            error instanceof Error
              ? error.message
              : "Unable to search messages.";

          if (message === "Could not validate credentials") {
            onSessionExpired();
            return;
          }

          setMessageSearchError(message);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setMessageSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeChatId, messageSearchQuery, onSessionExpired]);

  useEffect(() => {
    const messagesElement = messagesRef.current;

    if (!messagesElement || activeChatId === null || !activeChat) {
      return;
    }

    const serverLastReadMessageId =
      activeChat.current_last_read_message_id ?? 0;
    const localLastReadMessageId =
      lastReadMessageIdByChatRef.current[activeChatId] ?? 0;
    lastReadMessageIdByChatRef.current[activeChatId] = Math.max(
      serverLastReadMessageId,
      localLastReadMessageId,
    );

    const activeMessages = getVisibleMessages(messages, activeChatId);

    const getCurrentLastReadMessageId = () =>
      Math.max(
        activeChat.current_last_read_message_id ?? 0,
        lastReadMessageIdByChatRef.current[activeChatId] ?? 0,
      );

    const getUnreadIncomingMessages = () =>
      activeMessages.filter(
        (entry) =>
          entry.sender_id !== user.userId &&
          entry.delivery_status !== "sending" &&
          entry.delivery_status !== "failed" &&
          entry.id > getCurrentLastReadMessageId(),
      );

    const getMessageBounds = (messageId: number) => {
      const target = messagesElement.querySelector(
        `[data-message-id="${messageId}"]`,
      );

      if (!(target instanceof HTMLElement)) {
        return null;
      }

      const containerRect = messagesElement.getBoundingClientRect();
      const messageRect = target.getBoundingClientRect();
      const top =
        messageRect.top - containerRect.top + messagesElement.scrollTop;

      return {
        top,
        bottom: top + messageRect.height,
      };
    };

    const markCoveredMessagesRead = (coverage: {
      top: number;
      bottom: number;
    }) => {
      const currentLastReadMessageId = getCurrentLastReadMessageId();
      const unreadIncomingMessages = getUnreadIncomingMessages();
      let nextLastReadMessageId = currentLastReadMessageId;

      for (const entry of unreadIncomingMessages) {
        const messageBounds = getMessageBounds(entry.id);

        if (!messageBounds) {
          break;
        }

        const messageWasCovered =
          messageBounds.top >= coverage.top - 2 &&
          messageBounds.bottom <= coverage.bottom + 2;

        if (!messageWasCovered) {
          break;
        }

        nextLastReadMessageId = entry.id;
      }

      if (nextLastReadMessageId <= currentLastReadMessageId) {
        return;
      }

      const newlyReadCount = unreadIncomingMessages.filter(
        (entry) => entry.id <= nextLastReadMessageId,
      ).length;

      markChatReadThrough(activeChatId, nextLastReadMessageId, {
        unreadCountChange: newlyReadCount,
      });
    };

    const updateReadCoverage = () => {
      const viewportTop = messagesElement.scrollTop;
      const viewportBottom =
        messagesElement.scrollTop + messagesElement.clientHeight;
      const previousCoverage =
        readCoverageByChatRef.current[activeChatId];
      const nextCoverage = previousCoverage
        ? {
            top: Math.min(previousCoverage.top, viewportTop),
            bottom: Math.max(previousCoverage.bottom, viewportBottom),
          }
        : {
            top: viewportTop,
            bottom: viewportBottom,
          };

      readCoverageByChatRef.current[activeChatId] = nextCoverage;
      markCoveredMessagesRead(nextCoverage);
    };

    let animationFrameId = requestAnimationFrame(updateReadCoverage);

    const handleScroll = () => {
      saveChatScrollPosition(activeChatId, messagesElement.scrollTop);
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateReadCoverage);
    };

    messagesElement.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
      messagesElement.removeEventListener("scroll", handleScroll);
    };
  }, [
    activeChat,
    activeChatId,
    messages,
    onSessionExpired,
    user.userId,
  ]);

  useEffect(() => {
    const messagesElement = messagesRef.current;

    if (!messagesElement || activeChatId === null) {
      return;
    }

    const activeMessages = getVisibleMessages(messages, activeChatId);

    if (activeMessages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      const pendingScroll = pendingMessageScrollRef.current;

      if (
        pendingScroll &&
        pendingScroll.chatId === activeChatId &&
        pendingScroll.scrollTop !== null &&
        pendingScroll.scrollTop !== undefined
      ) {
        const maxScrollTop =
          messagesElement.scrollHeight - messagesElement.clientHeight;
        messagesElement.scrollTop = Math.min(
          pendingScroll.scrollTop,
          Math.max(0, maxScrollTop),
        );
        pendingMessageScrollRef.current = null;
        requestAnimationFrame(() => {
          messagesElement.dispatchEvent(new Event("scroll"));
        });
        return;
      }

      if (
        pendingScroll &&
        pendingScroll.chatId === activeChatId &&
        pendingScroll.unreadCount > 0
      ) {
        const firstUnreadMessage = activeMessages.find(
          (entry) =>
            entry.sender_id !== user.userId &&
            entry.delivery_status !== "sending" &&
            entry.delivery_status !== "failed" &&
            (pendingScroll.lastReadMessageId === null ||
              entry.id > pendingScroll.lastReadMessageId),
        );

        if (firstUnreadMessage) {
          const target = messagesElement.querySelector(
            `[data-message-id="${firstUnreadMessage.id}"]`,
          );

          if (target instanceof HTMLElement) {
            target.scrollIntoView({ block: "center" });
            pendingMessageScrollRef.current = null;
            requestAnimationFrame(() => {
              messagesElement.dispatchEvent(new Event("scroll"));
            });
            return;
          }
        }
      }

      messagesElement.scrollTop = messagesElement.scrollHeight;
      pendingMessageScrollRef.current = null;
      requestAnimationFrame(() => {
        messagesElement.dispatchEvent(new Event("scroll"));
      });
    });
  }, [activeChatId, messages.length, user.userId]);

  useEffect(() => {
    setProfileFirstName(user.firstName);
    setProfileLastName(user.lastName ?? "");
    setProfileBio(user.bio ?? "");
    setProfileAvatarUrl(user.avatarUrl);
  }, [user]);

  const handleSend = async () => {
    const socket = socketRef.current;
    if (!message.trim()) {
      return;
    }

    const outgoingMessage = message.trim();
    const tempId = crypto.randomUUID();
    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      chat_id: activeChatId ?? 0,
      sender_id: user.userId,
      sender_username: user.username,
      sender_avatar_url: user.avatarUrl,
      content: outgoingMessage,
      message_type: "text",
      reply_to_message_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pinned_at: null,
      pinned_by: null,
      is_pinned_for_me: false,
      metadata: {},
      isOwn: true,
      delivery_status: "sending",
      temp_id: tempId,
    };

    if (draftRecipient) {
      setMessages([optimisticMessage]);
      setMessage("");

      try {
        const result = await apiFetch<DirectMessageResponse>(
          "/messages/direct",
          {
            method: "POST",
            body: JSON.stringify({
              recipient_id: draftRecipient.id,
              content: outgoingMessage,
            }),
          },
        );

        setChats((current) =>
          upsertChatPreview(current, result.chat, result.message),
        );
        activeChatIdRef.current = result.chat.id;
        saveActiveChatId(result.chat.id);
        setActiveChatId(result.chat.id);
        setDraftRecipient(null);
        setMessages([
          { ...result.message, isOwn: true, delivery_status: "sent" },
        ]);
        markChatReadThrough(result.chat.id, result.message.id, {
          resetUnread: true,
        });
        socket?.emit("join_room", String(result.chat.id));
      } catch (error) {
        setMessages((current) =>
          current.map((entry) =>
            entry.temp_id === tempId
              ? { ...entry, delivery_status: "failed" }
              : entry,
          ),
        );

        const errorMessage =
          error instanceof Error ? error.message : "Unable to send message.";

        if (errorMessage === "Could not validate credentials") {
          onSessionExpired();
          return;
        }

        setChatError(errorMessage);
      }

      return;
    }

    if (activeChatId === null) {
      return;
    }

    setMessages((current) => [...current, optimisticMessage]);
    setChats((current) =>
      updateChatPreview(current, optimisticMessage),
    );
    setMessage("");

    try {
      const responseMessage = await apiFetch<ChatMessage>(
        `/chats/${activeChatId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: outgoingMessage,
          }),
        },
      );

      const confirmedMessage = {
        ...responseMessage,
        isOwn: true,
        delivery_status: "sent" as const,
      };

      setMessages((current) =>
        replaceTemporaryMessage(current, tempId, confirmedMessage),
      );
      setChats((current) =>
        updateChatPreview(current, confirmedMessage),
      );
      markChatReadThrough(activeChatId, confirmedMessage.id, {
        resetUnread: true,
      });
    } catch (error) {
      setMessages((current) =>
        current.map((entry) =>
          entry.temp_id === tempId
            ? { ...entry, delivery_status: "failed" }
            : entry,
        ),
      );

      const errorMessage =
        error instanceof Error ? error.message : "Unable to send message.";

      if (errorMessage === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(errorMessage);
    }
  };

  const handleRetry = () => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    setStatus("Connecting...");
    setConnectionError(null);
    socket.connect();
  };

  const joinChat = (chat: Chat) => {
    const socket = socketRef.current;
    const chatId = chat.id;

    if (socket && activeChatIdRef.current !== null) {
      socket.emit("leave_room", String(activeChatIdRef.current));
    }
    socket?.emit("join_room", String(chatId));
    pendingMessageScrollRef.current = {
      chatId,
      lastReadMessageId: chat.current_last_read_message_id,
      unreadCount: chat.unread_count,
    };
    activeChatIdRef.current = chatId;
    saveActiveChatId(chatId);
    setActiveChatId(chatId);
    setDraftRecipient(null);
    setMessages([]);
  };

  const toggleChatPin = async (chat: Chat) => {
    const nextIsPinned = !chat.is_pinned;

    setChats((current) =>
      sortChats(
        current.map((item) =>
          item.id === chat.id
            ? { ...item, is_pinned: nextIsPinned }
            : item,
        ),
      ),
    );

    try {
      const result = await apiFetch<ChatSettingsResponse>(
        `/chats/${chat.id}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_pinned: nextIsPinned }),
        },
      );

      setChats((current) =>
        sortChats(
          current.map((item) =>
            item.id === chat.id
              ? { ...item, is_pinned: result.is_pinned }
              : item,
          ),
        ),
      );
      setChatError(null);
    } catch (error) {
      setChats((current) =>
        sortChats(
          current.map((item) =>
            item.id === chat.id
              ? { ...item, is_pinned: chat.is_pinned }
              : item,
          ),
        ),
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to update chat settings.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    }
  };

  const updateMessagePinState = (
    messageId: number,
    updates: Partial<Pick<ChatMessage, "pinned_at" | "pinned_by" | "is_pinned_for_me">>,
  ) => {
    setMessages((current) =>
      current.map((entry) =>
        entry.id === messageId ? { ...entry, ...updates } : entry,
      ),
    );
    setMessageSearchResults((current) =>
      current.map((entry) =>
        entry.id === messageId ? { ...entry, ...updates } : entry,
      ),
    );
  };

  const pinMessage = async (entry: ChatMessage, scope: "me" | "chat") => {
    if (entry.temp_id || entry.delivery_status === "sending") {
      return;
    }

    const previousPinState = {
      pinned_at: entry.pinned_at,
      pinned_by: entry.pinned_by,
      is_pinned_for_me: entry.is_pinned_for_me,
    };

    updateMessagePinState(
      entry.id,
      scope === "me"
        ? { is_pinned_for_me: true }
        : {
            pinned_at: new Date().toISOString(),
            pinned_by: user.userId,
          },
    );

    try {
      await apiFetch<{ ok: boolean }>(`/messages/${entry.id}/pin`, {
        method: "POST",
        body: JSON.stringify({ scope }),
      });
      setChatError(null);
    } catch (error) {
      updateMessagePinState(entry.id, previousPinState);

      const message =
        error instanceof Error ? error.message : "Unable to pin message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    }
  };

  const unpinMessage = async (entry: ChatMessage) => {
    if (entry.temp_id || entry.delivery_status === "sending") {
      return;
    }

    const previousPinState = {
      pinned_at: entry.pinned_at,
      pinned_by: entry.pinned_by,
      is_pinned_for_me: entry.is_pinned_for_me,
    };

    updateMessagePinState(entry.id, {
      pinned_at: null,
      pinned_by: null,
      is_pinned_for_me: false,
    });

    try {
      await apiFetch<{ ok: boolean }>(`/messages/${entry.id}/unpin`, {
        method: "DELETE",
      });
      setChatError(null);
    } catch (error) {
      updateMessagePinState(entry.id, previousPinState);

      const message =
        error instanceof Error ? error.message : "Unable to unpin message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    }
  };

  const removeMessageLocally = (messageId: number, chatId: number) => {
    setMessages((current) =>
      current.filter(
        (entry) => entry.id !== messageId || entry.chat_id !== chatId,
      ),
    );
    setMessageSearchResults((current) =>
      current.filter(
        (entry) => entry.id !== messageId || entry.chat_id !== chatId,
      ),
    );
    setActiveSearchResultId((current) =>
      current === messageId ? null : current,
    );
    setEditingMessageId((current) =>
      current === messageId ? null : current,
    );
  };

  const startEditingMessage = (entry: ChatMessage) => {
    setEditingMessageId(entry.id);
    setEditingMessageText(entry.content ?? "");
    setChatError(null);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessageSaving(false);
  };

  const saveMessageEdit = async (entry: ChatMessage) => {
    const content = editingMessageText.trim();

    if (!content) {
      setChatError("Message cannot be empty.");
      return;
    }

    if (content === (entry.content ?? "")) {
      cancelEditingMessage();
      return;
    }

    setEditingMessageSaving(true);
    setChatError(null);

    try {
      const updatedMessage = await apiFetch<ChatMessage>(
        `/messages/${entry.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
        },
      );

      applyMessageUpdate(updatedMessage);
      cancelEditingMessage();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to edit message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    } finally {
      setEditingMessageSaving(false);
    }
  };

  const deleteMessage = async (
    entry: ChatMessage,
    scope: "me" | "chat",
  ) => {
    if (entry.temp_id || entry.delivery_status === "sending") {
      return;
    }

    const remainingVisibleMessages = getVisibleMessages(
      messages,
      entry.chat_id,
    ).filter((message) => message.id !== entry.id);
    const replacementLastMessage =
      remainingVisibleMessages[remainingVisibleMessages.length - 1] ?? null;

    try {
      await apiFetch<{ ok: boolean }>(`/messages/${entry.id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope }),
      });

      removeMessageLocally(entry.id, entry.chat_id);

      if (scope === "chat") {
        void refreshChats();
      } else if (activeChat?.last_message_id === entry.id) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === entry.chat_id
              ? {
                  ...chat,
                  last_message_id: replacementLastMessage?.id ?? null,
                  last_message_text: replacementLastMessage?.content ?? null,
                  last_message_sender_id:
                    replacementLastMessage?.sender_id ?? null,
                  last_message_created_at:
                    replacementLastMessage?.created_at ?? null,
                }
              : chat,
          ),
        );
      }

      setChatError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete message.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatError(message);
    }
  };

  const handleProfileSearch = async (event: React.FormEvent) => {
    event.preventDefault();

    const username = profileQuery.trim();

    if (!username) {
      setProfileResult(null);
      setProfileError("Enter a username to search.");
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const profile = await apiFetch<UserProfile>(
        `/users/by-username/${encodeURIComponent(username)}`,
      );

      setProfileResult(profile);
    } catch (error) {
      setProfileResult(null);

      const message =
        error instanceof Error ? error.message : "Unable to find that user.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const getProfileDisplayName = (profile: UserProfile) => {
    return `${profile.first_name}${
      profile.last_name ? ` ${profile.last_name}` : ""
    }`;
  };

  const getChatMemberDisplayName = (member: ChatMember) => {
    return `${member.first_name}${member.last_name ? ` ${member.last_name}` : ""}`;
  };

  const loadMemberDefaultPermissions = async (chatId: number) => {
    setMemberPermissionsLoading(true);
    setMemberPermissionsError(null);
    setMemberPermissionsMessage(null);

    try {
      const permissions = await apiFetch<MemberPermissions>(
        `/chats/${chatId}/member-default-permissions`,
      );
      setMemberPermissions(permissions);
      setMemberPermissionsDraft({ ...permissions });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load member permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setMemberPermissionsError(message);
    } finally {
      setMemberPermissionsLoading(false);
    }
  };

  const loadAdminPermissions = async (chatId: number, memberId: number) => {
    setAdminPermissionsLoadingUserId(memberId);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      const permissions = await apiFetch<AdminPermissions>(
        `/chats/${chatId}/admins/${memberId}/permissions`,
      );
      setAdminPermissionsByUserId((current) => ({
        ...current,
        [memberId]: permissions,
      }));
      setAdminPermissionsDraftByUserId((current) => ({
        ...current,
        [memberId]: permissions,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load admin permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsLoadingUserId(null);
    }
  };

  useEffect(() => {
    if (
      activeChat?.type !== "group" ||
      activeChat.current_user_role !== "admin" ||
      adminPermissionsByUserId[user.userId]
    ) {
      return;
    }

    void loadAdminPermissions(activeChat.id, user.userId);
  }, [
    activeChat?.id,
    activeChat?.type,
    activeChat?.current_user_role,
    adminPermissionsByUserId,
    user.userId,
  ]);

  const loadChatMembers = async (
    chat: Chat,
    options: { showPanel?: boolean; openOtherProfile?: boolean } = {},
  ) => {
    const showPanel = options.showPanel ?? true;

    setChatInfoOpen(showPanel);
    setChatInfoLoading(true);
    setChatInfoError(null);
    setSelectedChatMember(null);

    try {
      const members = await apiFetch<ChatMember[]>(
        `/chats/${chat.id}/members`,
      );
      setChatInfoMembers(members);

      if (chat.type === "group") {
        void loadMemberDefaultPermissions(chat.id);
      }

      if (options.openOtherProfile) {
        setSelectedChatMember(
          members.find((member) => member.user_id !== user.userId) ??
            members[0] ??
            null,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load chat members.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setChatInfoError(message);
      if (!showPanel) {
        setChatError(message);
      }
    } finally {
      setChatInfoLoading(false);
    }
  };

  const handleChatHeaderClick = () => {
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
      return;
    }

    void loadChatMembers(activeChat, { showPanel: true });
  };

  const handleAddSelectedGroupMember = async () => {
    const username = groupMemberQuery.trim();

    if (!username) {
      setGroupError("Enter a username to add.");
      setGroupMessage(null);
      return;
    }

    setGroupMemberLoading(true);
    setGroupError(null);
    setGroupMessage(null);

    try {
      const profile = await apiFetch<UserProfile>(
        `/users/by-username/${encodeURIComponent(username)}`,
      );

      if (profile.id === user.userId) {
        setGroupError("You are already included in every group you create.");
        return;
      }

      if (groupSelectedMembers.some((member) => member.id === profile.id)) {
        setGroupError(`${profile.username} is already selected.`);
        return;
      }

      setGroupSelectedMembers((current) => [...current, profile]);
      setGroupMemberQuery("");
      setGroupMessage(`${profile.username} selected.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to find that user.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setGroupError(message);
    } finally {
      setGroupMemberLoading(false);
    }
  };

  const removeSelectedGroupMember = (memberId: number) => {
    setGroupSelectedMembers((current) =>
      current.filter((member) => member.id !== memberId),
    );
  };

  const resetGroupForm = () => {
    setGroupTitle("");
    setGroupDescription("");
    setGroupAvatarUrl("/favicon.svg");
    setGroupMemberQuery("");
    setGroupSelectedMembers([]);
    setGroupError(null);
    setGroupMessage(null);
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!groupTitle.trim()) {
      setGroupError("Group name is required.");
      setGroupMessage(null);
      return;
    }

    setGroupCreating(true);
    setGroupError(null);
    setGroupMessage(null);

    try {
      const createdChat = await apiFetch<Chat>("/chats/group", {
        method: "POST",
        body: JSON.stringify({
          title: groupTitle.trim(),
          description: groupDescription.trim() || null,
          avatar_url: groupAvatarUrl.trim() || "/favicon.svg",
          member_ids: groupSelectedMembers.map((member) => member.id),
        }),
      });

      setChats((current) =>
        upsertChat(current, applyLocalReadState(createdChat)),
      );
      setCreatingGroup(false);
      resetGroupForm();
      joinChat(createdChat);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create group.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setGroupError(message);
    } finally {
      setGroupCreating(false);
    }
  };

  const handleAddMemberToActiveGroup = async (event: React.FormEvent) => {
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
      if (chatInfoOpen) {
        void loadChatMembers(updatedChat);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to add member.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAddMemberError(message);
    } finally {
      setAddMemberLoading(false);
    }
  };

  const openChatMemberProfile = (member: ChatMember) => {
    setSelectedChatMember(member);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    if (activeChat?.type === "group" && member.role === "admin") {
      void loadAdminPermissions(activeChat.id, member.user_id);
    }

    if (member.role === "member") {
      const defaultPermissions = buildDefaultAdminPermissions(
        memberPermissionsDraft ?? memberPermissions,
      );

      setAdminPermissionsDraftByUserId((current) => ({
        ...current,
        [member.user_id]: current[member.user_id] ?? defaultPermissions,
      }));
    }
  };

  const updateMemberBooleanPermission = (key: string, value: boolean) => {
    setMemberPermissionsDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setMemberPermissionsMessage(null);
    setMemberPermissionsError(null);
  };

  const updateMemberNumericPermission = (key: string, value: number) => {
    setMemberPermissionsDraft((current) =>
      current
        ? {
            ...current,
            [key]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
          }
        : current,
    );
    setMemberPermissionsMessage(null);
    setMemberPermissionsError(null);
  };

  const updateAdminPermission = (
    memberId: number,
    key: string,
    value: boolean,
  ) => {
    setAdminPermissionsDraftByUserId((current) => {
      const currentDraft =
        current[memberId] ??
        adminPermissionsByUserId[memberId] ??
        buildDefaultAdminPermissions(memberPermissionsDraft ?? memberPermissions);

      return {
        ...current,
        [memberId]: {
          ...currentDraft,
          [key]: value,
        },
      };
    });
    setAdminPermissionsMessage(null);
    setAdminPermissionsError(null);
  };

  const saveMemberDefaultPermissions = async () => {
    if (!activeChat || activeChat.type !== "group" || !memberPermissionsDraft) {
      return;
    }

    setMemberPermissionsSaving(true);
    setMemberPermissionsError(null);
    setMemberPermissionsMessage(null);

    try {
      await apiFetch<null>(
        `/chats/${activeChat.id}/member-default-permissions`,
        {
          method: "PATCH",
          body: JSON.stringify(memberPermissionsDraft),
        },
      );
      setMemberPermissions(memberPermissionsDraft);
      setMemberPermissionsMessage("Member defaults updated.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update member permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setMemberPermissionsError(message);
    } finally {
      setMemberPermissionsSaving(false);
    }
  };

  const promoteSelectedMember = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      selectedChatMember.role !== "member"
    ) {
      return;
    }

    const permissions = enforceAdminMemberOverlaps(
      adminPermissionsDraftByUserId[selectedChatMember.user_id] ??
        buildDefaultAdminPermissions(memberPermissionsDraft ?? memberPermissions),
      memberPermissionsDraft ?? memberPermissions,
    );

    setAdminPermissionsSavingUserId(selectedChatMember.user_id);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      await apiFetch<{ ok: boolean }>(
        `/chats/${activeChat.id}/admins/${selectedChatMember.user_id}/promote`,
        {
          method: "POST",
          body: JSON.stringify(permissions),
        },
      );

      setAdminPermissionsByUserId((current) => ({
        ...current,
        [selectedChatMember.user_id]: permissions,
      }));
      setAdminPermissionsDraftByUserId((current) => ({
        ...current,
        [selectedChatMember.user_id]: permissions,
      }));
      setChatInfoMembers((current) =>
        current.map((member) =>
          member.user_id === selectedChatMember.user_id
            ? { ...member, role: "admin" }
            : member,
        ),
      );
      setSelectedChatMember((current) =>
        current && current.user_id === selectedChatMember.user_id
          ? { ...current, role: "admin" }
          : current,
      );
      setAdminPermissionsMessage("Admin promoted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to promote admin.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsSavingUserId(null);
    }
  };

  const saveSelectedAdminPermissions = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      selectedChatMember.role !== "admin"
    ) {
      return;
    }

    const rawPermissions =
      adminPermissionsDraftByUserId[selectedChatMember.user_id] ??
      adminPermissionsByUserId[selectedChatMember.user_id];

    if (!rawPermissions) {
      setAdminPermissionsError("Load admin permissions first.");
      return;
    }

    const permissions = enforceAdminMemberOverlaps(
      rawPermissions,
      memberPermissionsDraft ?? memberPermissions,
    );

    setAdminPermissionsSavingUserId(selectedChatMember.user_id);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      await apiFetch<null>(
        `/chats/${activeChat.id}/admins/${selectedChatMember.user_id}/permissions`,
        {
          method: "PATCH",
          body: JSON.stringify(permissions),
        },
      );
      setAdminPermissionsByUserId((current) => ({
        ...current,
        [selectedChatMember.user_id]: permissions,
      }));
      setAdminPermissionsMessage("Admin permissions updated.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update admin permissions.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsSavingUserId(null);
    }
  };

  const dismissSelectedAdmin = async () => {
    if (
      !activeChat ||
      activeChat.type !== "group" ||
      !selectedChatMember ||
      selectedChatMember.role !== "admin"
    ) {
      return;
    }

    setAdminPermissionsSavingUserId(selectedChatMember.user_id);
    setAdminPermissionsError(null);
    setAdminPermissionsMessage(null);

    try {
      await apiFetch<{ ok: boolean }>(
        `/chats/${activeChat.id}/admins/${selectedChatMember.user_id}/dismiss`,
        {
          method: "POST",
        },
      );
      setAdminPermissionsByUserId((current) => {
        const next = { ...current };
        delete next[selectedChatMember.user_id];
        return next;
      });
      setAdminPermissionsDraftByUserId((current) => {
        const next = { ...current };
        delete next[selectedChatMember.user_id];
        return next;
      });
      setChatInfoMembers((current) =>
        current.map((member) =>
          member.user_id === selectedChatMember.user_id
            ? { ...member, role: "member" }
            : member,
        ),
      );
      setSelectedChatMember((current) =>
        current && current.user_id === selectedChatMember.user_id
          ? { ...current, role: "member" }
          : current,
      );
      setAdminPermissionsMessage("Admin dismissed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to dismiss admin.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setAdminPermissionsError(message);
    } finally {
      setAdminPermissionsSavingUserId(null);
    }
  };

  const revealMessageSearchResult = (entry: ChatMessage) => {
    setActiveSearchResultId(entry.id);

    const target = messagesRef.current?.querySelector(
      `[data-message-id="${entry.id}"]`,
    );

    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center" });
      requestAnimationFrame(() => {
        messagesRef.current?.dispatchEvent(new Event("scroll"));
      });
    }
  };

  const renderMessageContent = (entry: ChatMessage) => {
    const content = entry.content ?? "";
    const query = messageSearchQuery.trim();

    if (!query || entry.id !== activeSearchResultId) {
      return content;
    }

    return highlightSearchText(content, query);
  };

  const handleProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!profileFirstName.trim()) {
      setProfileSaveMessage(null);
      setProfileSaveError("First name is required.");
      return;
    }

    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveMessage(null);

    try {
      const updatedUser = await apiFetch<AuthResponse>("/users/me/", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: profileFirstName.trim(),
          last_name: profileLastName.trim() || null,
          bio: profileBio.trim() || null,
          avatar_url: profileAvatarUrl.trim() || "/favicon.svg",
        }),
      });

      onUserUpdated(updatedUser);
      setProfileSaveMessage("Profile updated.");
      setEditingProfile(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update profile.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      setProfileSaveError(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const getChatTitle = (chat: Chat) => {
    return chat.display_title || chat.title || "Chat";
  };

  const getChatSubtitle = (chat: Chat) => {
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
  };

  const formatChatTime = (value: string | null) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMessageDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diffInDays = Math.floor(
      (startOfToday.getTime() - startOfMessageDay.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (diffInDays === 0) {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    }

    if (diffInDays > 0 && diffInDays <= 6) {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
      }).format(date);
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    }).format(date);
  };

  const formatMessageTime = (value: string | null) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  const formatMessageDay = (value: string | null) => {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (isToday) {
      return "Today";
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const isSameMessageDay = (
    first: string | null,
    second: string | null,
  ) => {
    if (!first || !second) {
      return false;
    }

    const firstDate = new Date(first);
    const secondDate = new Date(second);

    if (
      Number.isNaN(firstDate.getTime()) ||
      Number.isNaN(secondDate.getTime())
    ) {
      return false;
    }

    return (
      firstDate.getFullYear() === secondDate.getFullYear() &&
      firstDate.getMonth() === secondDate.getMonth() &&
      firstDate.getDate() === secondDate.getDate()
    );
  };

  const activeTitle = draftRecipient
    ? `${draftRecipient.first_name}${
        draftRecipient.last_name ? ` ${draftRecipient.last_name}` : ""
      }`
    : activeChat
      ? getChatTitle(activeChat)
      : "Chat";
  const chatHeaderTitle = activeTitle;
  const chatHeaderAvatar = draftRecipient
    ? draftRecipient.avatar_url
    : activeChat
      ? activeChat.display_avatar_url || activeChat.avatar_url || "/favicon.svg"
      : "/favicon.svg";
  const chatHeaderSubtitle = draftRecipient
    ? `@${draftRecipient.username}`
    : activeChat?.type === "group"
      ? `${activeChat.member_count} ${
          activeChat.member_count === 1 ? "member" : "members"
        }`
      : activeChat?.type === "direct"
        ? ""
        : activeChat?.type === "self"
          ? "Private notes"
          : "Select a chat";
  const chatHeaderClickable =
    Boolean(activeChat) &&
    activeChat?.type !== "self" &&
    draftRecipient === null;

  const openDraftChat = (profile: UserProfile) => {
    const existingDirectChat = chats.find(
      (chat) =>
        chat.type === "direct" && chat.other_user_id === profile.id,
    );

    if (existingDirectChat) {
      joinChat(existingDirectChat);
      setProfileResult(null);
      setProfileError(null);
      return;
    }

    const socket = socketRef.current;

    if (activeChatIdRef.current !== null) {
      socket?.emit("leave_room", String(activeChatIdRef.current));
    }

    activeChatIdRef.current = null;
    setActiveChatId(null);
    setDraftRecipient(profile);
    setMessages([]);
    setMessage("");
  };

  const getSenderName = (entry: ChatMessage) => {
    if (entry.sender_id === user.userId) {
      return "You";
    }

    if (entry.sender_id === null) {
      return "System";
    }

    return entry.sender_username ?? `User ${entry.sender_id}`;
  };

  const getSenderAvatar = (entry: ChatMessage) => {
    if (entry.sender_id === user.userId) {
      return user.avatarUrl;
    }

    return entry.sender_avatar_url ?? "/favicon.svg";
  };

  const visibleMessages = getVisibleMessages(messages, activeChatId);
  const currentUserAdminPermissions =
    activeChat?.type === "group" &&
    activeChat.current_user_role === "admin"
      ? adminPermissionsByUserId[user.userId]
      : null;
  const currentUserCanDeleteGroupMessages =
    activeChat?.type === "group" &&
    (activeChat.current_user_role === "owner" ||
      currentUserAdminPermissions?.delete_messages === true);
  const otherLastReadMessageId =
    activeChat?.other_last_read_message_id;
  const latestOwnReadMessageId =
    otherLastReadMessageId === null ||
    otherLastReadMessageId === undefined
      ? null
      : visibleMessages.reduce<number | null>((latestMessageId, entry) => {
          if (
            entry.sender_id !== user.userId ||
            entry.delivery_status === "sending" ||
            entry.delivery_status === "failed" ||
            entry.id > otherLastReadMessageId
          ) {
            return latestMessageId;
          }

          return latestMessageId === null ||
            entry.id > latestMessageId
            ? entry.id
            : latestMessageId;
        }, null);

  const getMessageDeliveryStatus = (entry: ChatMessage) => {
    if (entry.sender_id !== user.userId) {
      return null;
    }

    if (entry.delivery_status === "sending") {
      return { kind: "sending", label: "Sending" };
    }

    if (entry.delivery_status === "failed") {
      return { kind: "failed", label: "Failed" };
    }

    if (
      otherLastReadMessageId !== null &&
      otherLastReadMessageId !== undefined &&
      entry.id <= otherLastReadMessageId
    ) {
      if (
        entry.id === latestOwnReadMessageId &&
        activeChat?.other_last_read_at
      ) {
        const readAt = formatChatTime(activeChat.other_last_read_at);
        return {
          kind: "read",
          label: readAt ? `Read ${readAt}` : "Read",
        };
      }

      return { kind: "read", label: "Read" };
    }

    return { kind: "sent", label: "Sent" };
  };

  const canAttemptManageGroup =
    activeChat?.type === "group" &&
    (activeChat.current_user_role === "owner" ||
      activeChat.current_user_role === "admin");
  const selectedAdminPermissions = selectedChatMember
    ? (adminPermissionsDraftByUserId[selectedChatMember.user_id] ??
      adminPermissionsByUserId[selectedChatMember.user_id] ??
      (selectedChatMember.role === "member"
        ? buildDefaultAdminPermissions(memberPermissionsDraft ?? memberPermissions)
        : null))
    : null;
  const canEditSelectedAdmin =
    canAttemptManageGroup &&
    selectedChatMember?.role === "admin" &&
    selectedChatMember.user_id !== user.userId;
  const canPromoteSelectedMember =
    canAttemptManageGroup &&
    selectedChatMember?.role === "member" &&
    selectedChatMember.user_id !== user.userId;
  const selectedMemberPermissionIsSaving =
    selectedChatMember !== null &&
    adminPermissionsSavingUserId === selectedChatMember.user_id;

  const adminPermissionIsForcedByMemberDefault = (key: string) => {
    return (
      (ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS as readonly string[]).includes(
        key,
      ) && (memberPermissionsDraft ?? memberPermissions)?.[key] === true
    );
  };

  return (
    <main className="chat-shell">
      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Chats">
          <div className="sidebar-profile">
            <div className="sidebar-profile-main">
              <img
                src={user.avatarUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = "/favicon.svg";
                }}
              />
              <div>
                <p>{user.firstName}</p>
                <span>@{user.username}</span>
              </div>
            </div>
            <div className="sidebar-profile-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingProfile((current) => !current);
                  setProfileSaveError(null);
                  setProfileSaveMessage(null);
                }}
              >
                {editingProfile ? "Close" : "Edit profile"}
              </Button>
              <Button variant="outline" size="sm" onClick={onSignOut}>
                Sign out
              </Button>
            </div>
          </div>
          <section className="profile-search" aria-label="Search user profiles">
            <form className="profile-search-form" onSubmit={handleProfileSearch}>
              <input
                type="search"
                value={profileQuery}
                placeholder="Search username"
                autoComplete="off"
                onChange={(event) => setProfileQuery(event.target.value)}
              />
              <Button type="submit" disabled={profileLoading}>
                {profileLoading ? "Searching..." : "Search"}
              </Button>
            </form>
            {profileError ? (
              <p className="profile-error">{profileError}</p>
            ) : null}
            {profileResult ? (
              <article className="profile-card">
                <img
                  src={profileResult.avatar_url}
                  alt=""
                  className="profile-avatar"
                />
                <div>
                  <h2>
                    {profileResult.first_name}
                    {profileResult.last_name ? ` ${profileResult.last_name}` : ""}
                  </h2>
                  <p className="profile-username">@{profileResult.username}</p>
                  {profileResult.bio ? (
                    <p className="profile-bio">{profileResult.bio}</p>
                  ) : null}
                  <span className="profile-status">{profileResult.status}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openDraftChat(profileResult)}
                >
                  Message
                </Button>
              </article>
            ) : null}
          </section>
          <section className="group-panel" aria-label="Create group chat">
            {!creatingGroup ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreatingGroup(true);
                  setGroupError(null);
                  setGroupMessage(null);
                }}
              >
                New group
              </Button>
            ) : (
              <form className="group-form" onSubmit={handleCreateGroup}>
                <div className="group-form-header">
                  <strong>Create group</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingGroup(false);
                      resetGroupForm();
                    }}
                  >
                    Close
                  </button>
                </div>
                <label>
                  Group name
                  <input
                    type="text"
                    value={groupTitle}
                    placeholder="Weekend plans"
                    onChange={(event) => setGroupTitle(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Description
                  <input
                    type="text"
                    value={groupDescription}
                    placeholder="Optional"
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                  />
                </label>
                <label>
                  Avatar URL
                  <input
                    type="url"
                    value={groupAvatarUrl}
                    placeholder="/favicon.svg"
                    onChange={(event) => setGroupAvatarUrl(event.target.value)}
                  />
                </label>
                <label>
                  Add members
                  <span className="group-inline-form">
                    <input
                      type="search"
                      value={groupMemberQuery}
                      placeholder="Username"
                      autoComplete="off"
                      onChange={(event) =>
                        setGroupMemberQuery(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleAddSelectedGroupMember();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={groupMemberLoading}
                      onClick={() => {
                        void handleAddSelectedGroupMember();
                      }}
                    >
                      {groupMemberLoading ? "Adding..." : "Add"}
                    </Button>
                  </span>
                </label>
                <p className="group-hint">
                  Leave members empty to create a group with only yourself.
                </p>
                {groupSelectedMembers.length > 0 ? (
                  <div className="selected-members">
                    {groupSelectedMembers.map((member) => (
                      <span className="selected-member" key={member.id}>
                        <span>
                          {getProfileDisplayName(member)}
                          <small>@{member.username}</small>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSelectedGroupMember(member.id)}
                        >
                          Remove
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                {groupError ? (
                  <p className="profile-error">{groupError}</p>
                ) : null}
                {groupMessage ? (
                  <p className="profile-success">{groupMessage}</p>
                ) : null}
                <Button type="submit" disabled={groupCreating}>
                  {groupCreating ? "Creating..." : "Create group"}
                </Button>
              </form>
            )}
          </section>
          <div className="sidebar-section-label">Chats</div>
          <div className="chat-list">
            {chats.map((chat) => (
              (() => {
                const sentAt = formatChatTime(
                  chat.last_message_created_at,
                );
                const unreadCount =
                  chat.unread_count > 99 ? "99+" : chat.unread_count;

                return (
                  <div
                    key={chat.id}
                    className={
                      [
                        "chat-list-item",
                        chat.id === activeChatId ? "active" : "",
                        chat.is_pinned ? "pinned" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  >
                    <button
                      type="button"
                      className="chat-open-button"
                      onClick={() => joinChat(chat)}
                    >
                      <img
                        src={
                          chat.display_avatar_url ||
                          chat.avatar_url ||
                          "/favicon.svg"
                        }
                        alt=""
                        onError={(event) => {
                          event.currentTarget.src = "/favicon.svg";
                        }}
                      />
                      <span>
                        <span className="chat-title-row">
                          <strong>{getChatTitle(chat)}</strong>
                          <span className="chat-title-meta">
                            {chat.unread_count > 0 ? (
                              <span
                                className="unread-badge"
                                aria-label={`${chat.unread_count} unread messages`}
                              >
                                {unreadCount}
                              </span>
                            ) : null}
                            {sentAt && chat.last_message_created_at ? (
                              <time dateTime={chat.last_message_created_at}>
                                {sentAt}
                              </time>
                            ) : null}
                          </span>
                        </span>
                        <small>{getChatSubtitle(chat)}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="chat-pin-button"
                      aria-label={
                        chat.is_pinned
                          ? `Unpin ${getChatTitle(chat)}`
                          : `Pin ${getChatTitle(chat)}`
                      }
                      aria-pressed={chat.is_pinned}
                      title={chat.is_pinned ? "Unpin" : "Pin"}
                      onClick={() => {
                        void toggleChatPin(chat);
                      }}
                    >
                      <Pin size={14} aria-hidden="true" />
                    </button>
                  </div>
                );
              })()
            ))}
            {draftRecipient ? (
              <div className="chat-list-item active">
                <button className="chat-open-button" type="button">
                  <img
                    src={draftRecipient.avatar_url}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.src = "/favicon.svg";
                    }}
                  />
                  <span>
                    <strong>
                      {draftRecipient.first_name}
                      {draftRecipient.last_name
                        ? ` ${draftRecipient.last_name}`
                        : ""}
                    </strong>
                    <small>New direct message</small>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </aside>
        <section className="chat-card">
        <header className="chat-window-header">
          <button
            type="button"
            className="chat-window-header-button"
            disabled={!chatHeaderClickable}
            onClick={handleChatHeaderClick}
          >
            <img
              src={chatHeaderAvatar}
              alt=""
              onError={(event) => {
                event.currentTarget.src = "/favicon.svg";
              }}
            />
            <span>
              <strong>{chatHeaderTitle}</strong>
              <small>{chatHeaderSubtitle}</small>
            </span>
          </button>
        </header>

        {chatInfoOpen && activeChat && activeChat.type === "group" ? (
          <div
            className="chat-info-backdrop"
            role="presentation"
            onClick={() => {
              setChatInfoOpen(false);
              setChatInfoError(null);
            }}
          >
          <section
            className="chat-info-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Group members"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-info-header">
              <div>
                <strong>{getChatTitle(activeChat)}</strong>
                <span>
                  {activeChat.member_count}{" "}
                  {activeChat.member_count === 1 ? "member" : "members"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatInfoOpen(false);
                  setChatInfoError(null);
                }}
              >
                Close
              </button>
            </div>

            {chatInfoLoading ? (
              <p className="message-search-empty">Loading...</p>
            ) : null}
            {chatInfoError ? (
              <p className="profile-error">{chatInfoError}</p>
            ) : null}

            {!chatInfoLoading &&
            !chatInfoError &&
            activeChat.type === "group" ? (
              <>
                <div className="chat-member-list">
                  {chatInfoMembers.map((member) => (
                    <button
                      type="button"
                      className="chat-member-row"
                      key={member.user_id}
                      onClick={() => openChatMemberProfile(member)}
                    >
                      <img
                        src={member.avatar_url}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.src = "/favicon.svg";
                        }}
                      />
                      <div>
                        <strong>
                          {getChatMemberDisplayName(member)}
                          {member.user_id === user.userId ? " (You)" : ""}
                        </strong>
                        <span>@{member.username}</span>
                      </div>
                      <small>{member.role}</small>
                    </button>
                  ))}
                </div>

                <div className="chat-members-panel">
                  <div>
                    <strong>Add member</strong>
                    <span>Anyone in this group can add another user.</span>
                  </div>
                  <form onSubmit={handleAddMemberToActiveGroup}>
                    <input
                      type="search"
                      value={addMemberQuery}
                      placeholder="Add member by username"
                      autoComplete="off"
                      onChange={(event) => {
                        setAddMemberQuery(event.target.value);
                        setAddMemberError(null);
                        setAddMemberMessage(null);
                      }}
                    />
                    <Button type="submit" disabled={addMemberLoading}>
                      {addMemberLoading ? "Adding..." : "Add member"}
                    </Button>
                  </form>
                  {addMemberError ? (
                    <p className="profile-error">{addMemberError}</p>
                  ) : null}
                  {addMemberMessage ? (
                    <p className="profile-success">{addMemberMessage}</p>
                  ) : null}
                </div>

                <div className="permissions-panel">
                  <div className="permissions-panel-header">
                    <div>
                      <strong>Default member permissions</strong>
                      <span>
                        Applies to all members. Editing this requires the
                        ban-users permission.
                      </span>
                    </div>
                    {memberPermissionsLoading ? (
                      <small>Loading...</small>
                    ) : null}
                  </div>

                  {memberPermissionsDraft ? (
                    <div className="permission-list">
                      {MEMBER_BOOLEAN_PERMISSION_KEYS.map((key) => (
                        <label className="permission-row" key={key}>
                          <span>{PERMISSION_LABELS[key]}</span>
                          <input
                            type="checkbox"
                            checked={memberPermissionsDraft[key] === true}
                            disabled={!canAttemptManageGroup}
                            onChange={(event) =>
                              updateMemberBooleanPermission(
                                key,
                                event.target.checked,
                              )
                            }
                          />
                        </label>
                      ))}
                      {MEMBER_NUMERIC_PERMISSION_KEYS.map((key) => (
                        <label className="permission-row" key={key}>
                          <span>{PERMISSION_LABELS[key]}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={Number(memberPermissionsDraft[key] ?? 0)}
                            disabled={!canAttemptManageGroup}
                            onChange={(event) =>
                              updateMemberNumericPermission(
                                key,
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ) : memberPermissionsLoading ? null : (
                    <p className="message-search-empty">
                      Permission defaults are not loaded.
                    </p>
                  )}

                  {memberPermissionsError ? (
                    <p className="profile-error">{memberPermissionsError}</p>
                  ) : null}
                  {memberPermissionsMessage ? (
                    <p className="profile-success">
                      {memberPermissionsMessage}
                    </p>
                  ) : null}
                  {canAttemptManageGroup ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        memberPermissionsSaving || !memberPermissionsDraft
                      }
                      onClick={() => {
                        void saveMemberDefaultPermissions();
                      }}
                    >
                      {memberPermissionsSaving
                        ? "Saving..."
                        : "Save member defaults"}
                    </Button>
                  ) : (
                    <p className="permissions-note">View only.</p>
                  )}
                </div>
              </>
            ) : null}
          </section>
          </div>
        ) : null}

        {selectedChatMember ? (
          <div
            className="profile-card-backdrop"
            role="presentation"
            onClick={() => setSelectedChatMember(null)}
          >
            <article
              className="profile-popup-card"
              role="dialog"
              aria-modal="true"
              aria-label={`${getChatMemberDisplayName(selectedChatMember)} profile`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="profile-popup-close"
                aria-label="Close profile"
                onClick={() => setSelectedChatMember(null)}
              >
                &times;
              </button>
              <img
                src={selectedChatMember.avatar_url}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = "/favicon.svg";
                }}
              />
              <div>
                <h2>{getChatMemberDisplayName(selectedChatMember)}</h2>
                <p className="profile-username">
                  @{selectedChatMember.username}
                </p>
                {selectedChatMember.bio ? (
                  <p className="profile-bio">{selectedChatMember.bio}</p>
                ) : null}
                <span className="profile-status">
                  {selectedChatMember.status}
                </span>
                {activeChat?.type === "group" ? (
                  <section className="member-permissions-card">
                    <div className="member-permissions-header">
                      <div>
                        <strong>{selectedChatMember.role}</strong>
                        <span>Group role</span>
                      </div>
                      {adminPermissionsLoadingUserId ===
                      selectedChatMember.user_id ? (
                        <small>Loading rights...</small>
                      ) : null}
                    </div>

                    {selectedChatMember.role === "owner" ? (
                      <p className="permissions-note">
                        Owners have all rights and cannot be managed here.
                      </p>
                    ) : null}

                    {selectedChatMember.role === "admin" ||
                    selectedChatMember.role === "member" ? (
                      <div className="permission-list compact">
                        {ADMIN_PERMISSION_KEYS.map((key) => {
                          const forcedByMemberDefault =
                            adminPermissionIsForcedByMemberDefault(key);
                          const canChangePermission =
                            selectedChatMember.role === "member"
                              ? canPromoteSelectedMember
                              : canEditSelectedAdmin;

                          return (
                            <label className="permission-row" key={key}>
                              <span>
                                {PERMISSION_LABELS[key]}
                                {forcedByMemberDefault ? (
                                  <small>Enabled for all members</small>
                                ) : null}
                              </span>
                              <input
                                type="checkbox"
                                checked={
                                  forcedByMemberDefault ||
                                  selectedAdminPermissions?.[key] === true
                                }
                                disabled={
                                  forcedByMemberDefault ||
                                  !canChangePermission ||
                                  selectedMemberPermissionIsSaving
                                }
                                onChange={(event) =>
                                  updateAdminPermission(
                                    selectedChatMember.user_id,
                                    key,
                                    event.target.checked,
                                  )
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    {adminPermissionsError ? (
                      <p className="profile-error">{adminPermissionsError}</p>
                    ) : null}
                    {adminPermissionsMessage ? (
                      <p className="profile-success">
                        {adminPermissionsMessage}
                      </p>
                    ) : null}

                    {selectedChatMember.role === "member" &&
                    canPromoteSelectedMember ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={selectedMemberPermissionIsSaving}
                        onClick={() => {
                          void promoteSelectedMember();
                        }}
                      >
                        {selectedMemberPermissionIsSaving
                          ? "Promoting..."
                          : "Promote to admin"}
                      </Button>
                    ) : null}

                    {selectedChatMember.role === "admin" ? (
                      <div className="member-permissions-actions">
                        {canEditSelectedAdmin ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={selectedMemberPermissionIsSaving}
                              onClick={() => {
                                void saveSelectedAdminPermissions();
                              }}
                            >
                              {selectedMemberPermissionIsSaving
                                ? "Saving..."
                                : "Save admin rights"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={selectedMemberPermissionIsSaving}
                              onClick={() => {
                                void dismissSelectedAdmin();
                              }}
                            >
                              Dismiss admin
                            </Button>
                          </>
                        ) : selectedChatMember.user_id === user.userId ? (
                          <p className="permissions-note">
                            You can view your admin rights, but not edit them.
                          </p>
                        ) : (
                          <p className="permissions-note">
                            Backend permission checks decide whether you can
                            manage this admin.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </article>
          </div>
        ) : null}

        {editingProfile ? (
          <section className="profile-editor" aria-label="Edit your profile">
            <div className="profile-editor-header">
              <img src={profileAvatarUrl} alt="" className="profile-avatar" />
              <div>
                <h2>Edit profile</h2>
                <p>@{user.username}</p>
              </div>
            </div>
            <form className="profile-editor-form" onSubmit={handleProfileUpdate}>
              <label>
                First name
                <input
                  type="text"
                  value={profileFirstName}
                  maxLength={64}
                  onChange={(event) => setProfileFirstName(event.target.value)}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={profileLastName}
                  maxLength={64}
                  onChange={(event) => setProfileLastName(event.target.value)}
                />
              </label>
              <label>
                Bio
                <textarea
                  value={profileBio}
                  maxLength={70}
                  rows={3}
                  onChange={(event) => setProfileBio(event.target.value)}
                />
                <span>{profileBio.length}/70</span>
              </label>
              <label>
                Avatar URL
                <input
                  type="url"
                  value={profileAvatarUrl}
                  placeholder="/favicon.svg"
                  onChange={(event) => setProfileAvatarUrl(event.target.value)}
                />
              </label>
              {profileSaveError ? (
                <p className="profile-error">{profileSaveError}</p>
              ) : null}
              {profileSaveMessage ? (
                <p className="profile-success">{profileSaveMessage}</p>
              ) : null}
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving..." : "Save profile"}
              </Button>
            </form>
          </section>
        ) : null}

        <section className="message-search" aria-label="Search messages">
          <form
            className="message-search-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              type="search"
              value={messageSearchQuery}
              placeholder="Search in this chat"
              autoComplete="off"
              disabled={activeChatId === null}
              onChange={(event) => {
                const value = event.target.value;
                setMessageSearchQuery(value);
                setMessageSearchResults([]);
                setMessageSearchError(null);
                setMessageSearchHasSearched(false);
                setActiveSearchResultId(null);

                if (!value.trim()) {
                  setActiveSearchResultId(null);
                }
              }}
            />
          </form>

          {messageSearchError ? (
            <p className="profile-error">{messageSearchError}</p>
          ) : null}

          {messageSearchLoading ? (
            <p className="message-search-empty">Searching...</p>
          ) : null}

          {messageSearchResults.length > 0 ? (
            <div className="message-search-results">
              {messageSearchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={
                    result.id === activeSearchResultId
                      ? "active"
                      : undefined
                  }
                  onClick={() => revealMessageSearchResult(result)}
                >
                  <span>
                    <strong>{getSenderName(result)}</strong>
                    {result.created_at ? (
                      <time dateTime={result.created_at}>
                        {formatMessageTime(result.created_at)}
                      </time>
                    ) : null}
                  </span>
                  <small>
                    {highlightSearchText(
                      getSearchExcerpt(
                        result.content,
                        messageSearchQuery,
                      ),
                      messageSearchQuery,
                    )}
                  </small>
                </button>
              ))}
            </div>
          ) : null}

          {messageSearchHasSearched &&
          !messageSearchLoading &&
          !messageSearchError &&
          messageSearchResults.length === 0 ? (
            <p className="message-search-empty">No matching messages.</p>
          ) : null}
        </section>

        {chatError ? (
          <p className="profile-error">{chatError}</p>
        ) : null}

        <ul id="messages" ref={messagesRef}>
          {visibleMessages.length === 0 ? (
            <li className="empty-state">No messages yet in this chat.</li>
          ) : (
            visibleMessages.map((entry, index) => {
              const previousEntry = visibleMessages[index - 1];
              const sentAt = formatMessageTime(entry.created_at);
              const dayLabel = formatMessageDay(entry.created_at);
              const showDaySeparator =
                !previousEntry ||
                !isSameMessageDay(previousEntry.created_at, entry.created_at);
              const deliveryStatus = getMessageDeliveryStatus(entry);
              const hasSharedPin = Boolean(entry.pinned_at);
              const hasPersonalPin = entry.is_pinned_for_me;
              const canUseMessageActions =
                Boolean(activeChat) &&
                !entry.temp_id &&
                entry.delivery_status !== "sending" &&
                entry.delivery_status !== "failed";
              const canEditMessage =
                canUseMessageActions &&
                entry.sender_id === user.userId &&
                entry.content !== null &&
                entry.message_type === "text";
              const isEditingMessage = editingMessageId === entry.id;
              const canDeleteGroupMessage =
                activeChat?.type === "group" &&
                (entry.sender_id === user.userId ||
                  currentUserCanDeleteGroupMessages);
              const messageKey = `${entry.sender_id ?? "system"}-${
                entry.id ?? index
              }`;

              return (
                <Fragment key={messageKey}>
                  {showDaySeparator && dayLabel ? (
                    <li className="message-day-separator">{dayLabel}</li>
                  ) : null}

                  <li
                    className={[
                      entry.sender_id === user.userId || entry.isOwn
                        ? "you"
                        : "server",
                      entry.id === activeSearchResultId
                        ? "search-highlight"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-message-id={entry.id}
                  >
                    <img
                      src={getSenderAvatar(entry)}
                      alt=""
                      className="message-avatar"
                      onError={(event) => {
                        event.currentTarget.src = "/favicon.svg";
                      }}
                    />
                    <div className="message-copy">
                      <span className="sender">{getSenderName(entry)}</span>
                      {isEditingMessage ? (
                        <form
                          className="message-edit-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveMessageEdit(entry);
                          }}
                        >
                          <textarea
                            value={editingMessageText}
                            maxLength={4000}
                            rows={3}
                            autoFocus
                            onChange={(event) =>
                              setEditingMessageText(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                (event.metaKey || event.ctrlKey)
                              ) {
                                event.preventDefault();
                                void saveMessageEdit(entry);
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEditingMessage();
                              }
                            }}
                          />
                          <span className="message-edit-actions">
                            <button
                              type="submit"
                              disabled={editingMessageSaving}
                            >
                              {editingMessageSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              disabled={editingMessageSaving}
                              onClick={cancelEditingMessage}
                            >
                              Cancel
                            </button>
                          </span>
                        </form>
                      ) : (
                        <span>{renderMessageContent(entry)}</span>
                      )}
                      {hasSharedPin || hasPersonalPin ? (
                        <span className="message-pin-state">
                          <Pin size={12} aria-hidden="true" />
                          {hasSharedPin ? "Pinned in chat" : null}
                          {hasSharedPin && hasPersonalPin ? " · " : null}
                          {hasPersonalPin ? "Pinned for me" : null}
                        </span>
                      ) : null}
                      {canUseMessageActions ? (
                        <span className="message-actions">
                          {activeChat?.type === "group" ? (
                            <>
                              {canEditMessage && !isEditingMessage ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingMessage(entry)}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {hasSharedPin ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void unpinMessage(entry);
                                  }}
                                >
                                  Unpin
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void pinMessage(entry, "chat");
                                  }}
                                >
                                  Pin
                                </button>
                              )}
                              {canDeleteGroupMessage ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deleteMessage(entry, "chat");
                                  }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </>
                          ) : activeChat?.type === "self" ? (
                            <>
                              {canEditMessage && !isEditingMessage ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingMessage(entry)}
                                >
                                  Edit
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  void deleteMessage(entry, "chat");
                                }}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              {canEditMessage && !isEditingMessage ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingMessage(entry)}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {!hasPersonalPin ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void pinMessage(entry, "me");
                                  }}
                                >
                                  Pin me
                                </button>
                              ) : null}
                              {!hasSharedPin ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void pinMessage(entry, "chat");
                                  }}
                                >
                                  Pin chat
                                </button>
                              ) : null}
                              {hasPersonalPin || hasSharedPin ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void unpinMessage(entry);
                                  }}
                                >
                                  Unpin
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  void deleteMessage(entry, "me");
                                }}
                              >
                                Delete me
                              </button>
                              {entry.sender_id === user.userId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deleteMessage(entry, "chat");
                                  }}
                                >
                                  Delete both
                                </button>
                              ) : null}
                            </>
                          )}
                        </span>
                      ) : null}
                      <span className="message-meta">
                        {sentAt && entry.created_at ? (
                          <time dateTime={entry.created_at}>{sentAt}</time>
                        ) : null}
                        {entry.edited_at ? <span>edited</span> : null}
                        {deliveryStatus ? (
                          <span
                            className={`message-status ${deliveryStatus.kind}`}
                            aria-label={deliveryStatus.label}
                            title={deliveryStatus.label}
                          >
                            {deliveryStatus.kind === "sending" ? (
                              <ClockArrowUp size={14} aria-hidden="true" />
                            ) : null}
                            {deliveryStatus.kind === "sent" ? (
                              <Check size={15} aria-hidden="true" />
                            ) : null}
                            {deliveryStatus.kind === "read" ? (
                              <CheckCheck size={16} aria-hidden="true" />
                            ) : null}
                            {deliveryStatus.kind === "failed" ? (
                              <span aria-hidden="true">!</span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                </Fragment>
              );
            })
          )}
        </ul>

        <div className="composer">
          <input
            id="message"
            type="text"
            value={message}
            placeholder="Write a message..."
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={activeChatId === null && draftRecipient === null}
          >
            Send
          </button>
        </div>
        {status !== "Connected" ? (
          <div className="connection-retry">
            {connectionError ? (
              <p className="status-copy">{connectionError}</p>
            ) : null}
            <button className="retry-button" onClick={handleRetry}>
              Retry connection
            </button>
          </div>
        ) : null}
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadCurrentUser() {
      try {
        const currentUser = await apiFetch<AuthResponse>("/users/me/");

        if (!ignore) {
          setUser(toAuthUser(currentUser));
        }
      } catch {
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setCheckingAuth(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      ignore = true;
    };
  }, []);

  const handleAuthSuccess = (authUser: AuthResponse) => {
    setUser(toAuthUser(authUser));
  };

  const handleUserUpdated = (authUser: AuthResponse) => {
    setUser(toAuthUser(authUser));
  };

  const handleSignOut = async () => {
    try {
      await apiFetch<{ ok: boolean }>("/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error(error);
    }

    setUser(null);
    setAuthView("login");
  };

  const handleSessionExpired = () => {
    setUser(null);
    setAuthView("login");
  };

  if (checkingAuth) {
    return (
      <main className="chat-shell">
        <section className="chat-card">
          <p className="status-copy">Checking your session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return authView === "login" ? (
      <Login
        onSuccess={handleAuthSuccess}
        onGoToSignup={() => setAuthView("signup")}
      />
    ) : (
      <Signup
        onSuccess={handleAuthSuccess}
        onGoToLogin={() => setAuthView("login")}
      />
    );
  }

  return (
    <ChatScreen
      user={user}
      onSignOut={handleSignOut}
      onSessionExpired={handleSessionExpired}
      onUserUpdated={handleUserUpdated}
    />
  );
}
