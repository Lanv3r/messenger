import type {
  AdminPermissions,
  MemberPermissionValue,
  MemberPermissions,
} from "@/types";

export const MEMBER_BOOLEAN_PERMISSION_KEYS = [
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

export const MEMBER_NUMERIC_PERMISSION_KEYS = ["slowmode_seconds"] as const;

export const ADMIN_PERMISSION_KEYS = [
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

export const ADMIN_MEMBER_OVERLAP_PERMISSION_KEYS = [
  "change_group_info",
  "add_members",
  "pin_messages",
] as const;

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
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

export const PERMISSION_LABELS: Record<string, string> = {
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

export function buildDefaultAdminPermissions(
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

export function enforceAdminMemberOverlaps(
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

export function buildEffectiveMemberPermissions(
  defaultPermissions: MemberPermissions | null,
  memberOverrides: Record<string, MemberPermissionValue> | null | undefined,
): MemberPermissions | null {
  if (!defaultPermissions) {
    return null;
  }

  const permissions: MemberPermissions = { ...defaultPermissions };
  const overrides = memberOverrides ?? {};

  for (const key of MEMBER_BOOLEAN_PERMISSION_KEYS) {
    if (defaultPermissions[key] === false) {
      permissions[key] = false;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      permissions[key] = overrides[key] === true;
    }
  }

  for (const key of MEMBER_NUMERIC_PERMISSION_KEYS) {
    const defaultValue = Number(defaultPermissions[key] ?? 0);
    const overrideValue = overrides[key];

    permissions[key] =
      overrideValue === undefined
        ? defaultValue
        : Math.max(defaultValue, Number(overrideValue));
  }

  return permissions;
}
