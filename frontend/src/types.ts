export type MessageReplyPreview = {
  id: number;
  sender_id: number | null;
  sender_username: string | null;
  content: string | null;
  message_type: string;
};

export type ChatMessage = {
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
  reply_to?: MessageReplyPreview | null;
};

export type MessageActionDialogState = {
  kind: "pin" | "delete";
  entry: ChatMessage;
};

export type MemberManagementMode = "admin" | "member" | null;

export type ComposerDraft = {
  text: string;
  reply_to_message_id: number | null;
};

export type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
  messageType: string;
};

export type AuthUser = {
  userId: number;
  username: string;
  firstName: string;
  lastName: string | null;
  bio: string | null;
  avatarUrl: string;
  status: string;
};

export type AuthResponse = {
  id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  bio?: string | null;
  avatar_url?: string;
  status?: string;
};

export type UserProfile = AuthResponse & {
  bio: string | null;
  avatar_url: string;
  status: string;
};

export type MemberPermissionValue = boolean | number;
export type MemberPermissions = Record<string, MemberPermissionValue>;
export type AdminPermissions = Record<string, boolean>;

export type ChatMember = {
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
  member_permissions: Record<string, MemberPermissionValue>;
};

export type Chat = {
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

export type DirectMessageResponse = {
  chat: Chat;
  message: ChatMessage;
};

export type ChatReadEvent = {
  chat_id: number;
  user_id: number;
  last_read_message_id: number;
  last_read_at: string | null;
};

export type ChatActivityUser = {
  user_id: number;
  display_name: string | null;
  username: string | null;
};

export type ChatActivityState = {
  typing: ChatActivityUser[];
  recording: ChatActivityUser[];
};

export type ChatTypingEvent = {
  user_id: number;
  display_name?: string | null;
  username: string | null;
  chat_id: number;
  is_typing: boolean;
};

export type ChatRecordingVoiceEvent = {
  user_id: number;
  display_name?: string | null;
  username: string | null;
  chat_id: number;
  is_recording: boolean;
};

export type ChatUpdatedEvent = {
  chat_id: number;
  last_message: ChatMessage;
};

export type ChatMembersUpdatedEvent = {
  chat: Chat;
  added_member_ids: number[];
  added_by: number | null;
  removed_member_ids?: number[];
  removed_by?: number | null;
};

export type RemovedFromChatEvent = {
  chat_id: number;
  removed_by: number | null;
};

export type MessagePinUpdatedEvent = {
  message_id: number;
  chat_id: number;
  pinned_at: string | null;
  pinned_by: number | null;
};

export type MessageDeletedEvent = {
  message_id: number;
  chat_id: number;
};

export type MessageDeliveryStatus = {
  kind: "sending" | "sent" | "read" | "failed";
  label: string;
} | null;

export type ChatSettingsResponse = {
  ok: boolean;
  chat_id: number;
  is_pinned: boolean;
  is_archived?: boolean;
  muted_until?: string | null;
};
