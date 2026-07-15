import { MemberManagementPanel } from "@/components/chat/MemberManagementPanel";
import { getAssetUrl } from "@/lib/message-helpers";
import type {
  AdminPermissions,
  ChatMember,
  MemberManagementMode,
  MemberPermissions,
  UserProfile,
} from "@/types";

type MemberProfileDialogProps = {
  member: ChatMember;
  currentUserId: number;
  showManagement: boolean;
  mode: MemberManagementMode;
  adminPermissionsLoading: boolean;
  hasActions: boolean;
  canPromoteMember: boolean;
  canEditAdmin: boolean;
  canEditMemberPermissions: boolean;
  canRemoveMember: boolean;
  memberPermissions: MemberPermissions | null;
  memberPermissionsDraft: MemberPermissions | null;
  selectedMemberPermissionsDraft: MemberPermissions | null;
  selectedMemberPermissionsSaving: boolean;
  selectedMemberPermissionsError: string | null;
  selectedMemberPermissionsMessage: string | null;
  selectedAdminPermissions: AdminPermissions | null;
  selectedMemberPermissionIsSaving: boolean;
  selectedMemberRemovalIsSaving: boolean;
  adminPermissionsError: string | null;
  adminPermissionsMessage: string | null;
  memberRemovalError: string | null;
  memberRemovalMessage: string | null;
  memberPermissionIsLockedByDefault: (key: string) => boolean;
  adminPermissionIsForcedByMemberDefault: (key: string) => boolean;
  getChatMemberDisplayName: (member: ChatMember) => string;
  onClose: () => void;
  onModeChange: (mode: MemberManagementMode) => void;
  onSelectedMemberBooleanPermissionChange: (
    key: string,
    value: boolean,
  ) => void;
  onSelectedMemberNumericPermissionChange: (key: string, value: number) => void;
  onAdminPermissionChange: (
    memberId: number,
    key: string,
    value: boolean,
  ) => void;
  onSaveSelectedMemberPermissions: () => void;
  onPromoteSelectedMember: () => void;
  onSaveSelectedAdminPermissions: () => void;
  onDismissSelectedAdmin: () => Promise<boolean>;
  onStartRemoveMember: () => void;
  onViewPromoterProfile: (profile: UserProfile) => void;
};

export function MemberProfileDialog({
  member,
  currentUserId,
  showManagement,
  mode,
  adminPermissionsLoading,
  hasActions,
  canPromoteMember,
  canEditAdmin,
  canEditMemberPermissions,
  canRemoveMember,
  memberPermissions,
  memberPermissionsDraft,
  selectedMemberPermissionsDraft,
  selectedMemberPermissionsSaving,
  selectedMemberPermissionsError,
  selectedMemberPermissionsMessage,
  selectedAdminPermissions,
  selectedMemberPermissionIsSaving,
  selectedMemberRemovalIsSaving,
  adminPermissionsError,
  adminPermissionsMessage,
  memberRemovalError,
  memberRemovalMessage,
  memberPermissionIsLockedByDefault,
  adminPermissionIsForcedByMemberDefault,
  getChatMemberDisplayName,
  onClose,
  onModeChange,
  onSelectedMemberBooleanPermissionChange,
  onSelectedMemberNumericPermissionChange,
  onAdminPermissionChange,
  onSaveSelectedMemberPermissions,
  onPromoteSelectedMember,
  onSaveSelectedAdminPermissions,
  onDismissSelectedAdmin,
  onStartRemoveMember,
  onViewPromoterProfile,
}: MemberProfileDialogProps) {
  const isPermissionsEditor = showManagement && mode !== null;
  const permissionsTitle =
    mode === "admin" ? "Admin rights" : "User permissions";
  const memberAvatar = (
    <img
      src={getAssetUrl(member.avatar_url)}
      alt=""
      onError={(event) => {
        event.currentTarget.src = "/favicon.svg";
      }}
    />
  );
  const memberIdentity = (
    <>
      <h2>{getChatMemberDisplayName(member)}</h2>
      <p className="profile-username">@{member.username}</p>
    </>
  );
  const memberManagementPanel = showManagement ? (
    <MemberManagementPanel
      member={member}
      currentUserId={currentUserId}
      mode={mode}
      adminPermissionsLoading={adminPermissionsLoading}
      hasActions={hasActions}
      canPromoteMember={canPromoteMember}
      canEditAdmin={canEditAdmin}
      canEditMemberPermissions={canEditMemberPermissions}
      canRemoveMember={canRemoveMember}
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
      onModeChange={onModeChange}
      onSelectedMemberBooleanPermissionChange={
        onSelectedMemberBooleanPermissionChange
      }
      onSelectedMemberNumericPermissionChange={
        onSelectedMemberNumericPermissionChange
      }
      onAdminPermissionChange={onAdminPermissionChange}
      onSaveSelectedMemberPermissions={onSaveSelectedMemberPermissions}
      onPromoteSelectedMember={onPromoteSelectedMember}
      onSaveSelectedAdminPermissions={onSaveSelectedAdminPermissions}
      onDismissSelectedAdmin={onDismissSelectedAdmin}
      onStartRemoveMember={onStartRemoveMember}
      onViewPromoterProfile={onViewPromoterProfile}
    />
  ) : null;

  return (
    <div className="profile-card-backdrop" role="presentation" onClick={onClose}>
      <article
        className={`profile-popup-card${
          isPermissionsEditor ? " member-permissions-editor" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={
          isPermissionsEditor
            ? permissionsTitle
            : `${getChatMemberDisplayName(member)} profile`
        }
        onClick={(event) => event.stopPropagation()}
      >
        {isPermissionsEditor ? (
          <div className="member-permissions-editor-scroll">
            <strong className="member-permissions-window-title">
              {permissionsTitle}
            </strong>
            <button
              type="button"
              className="profile-popup-close"
              aria-label="Close profile"
              onClick={onClose}
            >
              &times;
            </button>
            <div className="member-permissions-profile">
              {memberAvatar}
              <div>{memberIdentity}</div>
            </div>
            {memberManagementPanel}
          </div>
        ) : (
          <>
            <button
              type="button"
              className="profile-popup-close"
              aria-label="Close profile"
              onClick={onClose}
            >
              &times;
            </button>
            {memberAvatar}
            <div>
              {memberIdentity}
              {member.bio ? <p className="profile-bio">{member.bio}</p> : null}
              <span className="profile-status">{member.status}</span>
              {memberManagementPanel}
            </div>
          </>
        )}
      </article>
    </div>
  );
}
