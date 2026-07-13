import { MemberManagementPanel } from "@/components/chat/MemberManagementPanel";
import { getAssetUrl } from "@/lib/message-helpers";
import type {
  AdminPermissions,
  ChatMember,
  MemberManagementMode,
  MemberPermissions,
} from "@/types";

type MemberProfileDialogProps = {
  member: ChatMember;
  currentUserId: number;
  showManagement: boolean;
  showContactAction: boolean;
  isContact: boolean;
  contactActionLoading: boolean;
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
  onToggleContact: () => void;
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
  onDismissSelectedAdmin: () => void;
  onStartRemoveMember: () => void;
};

export function MemberProfileDialog({
  member,
  currentUserId,
  showManagement,
  showContactAction,
  isContact,
  contactActionLoading,
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
  onToggleContact,
  onModeChange,
  onSelectedMemberBooleanPermissionChange,
  onSelectedMemberNumericPermissionChange,
  onAdminPermissionChange,
  onSaveSelectedMemberPermissions,
  onPromoteSelectedMember,
  onSaveSelectedAdminPermissions,
  onDismissSelectedAdmin,
  onStartRemoveMember,
}: MemberProfileDialogProps) {
  return (
    <div className="profile-card-backdrop" role="presentation" onClick={onClose}>
      <article
        className="profile-popup-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${getChatMemberDisplayName(member)} profile`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="profile-popup-close"
          aria-label="Close profile"
          onClick={onClose}
        >
          &times;
        </button>
        <img
          src={getAssetUrl(member.avatar_url)}
          alt=""
          onError={(event) => {
            event.currentTarget.src = "/favicon.svg";
          }}
        />
        <div>
          <h2>{getChatMemberDisplayName(member)}</h2>
          <p className="profile-username">@{member.username}</p>
          {member.bio ? <p className="profile-bio">{member.bio}</p> : null}
          <span className="profile-status">{member.status}</span>
          {showContactAction ? (
            <button
              type="button"
              className="profile-contact-button"
              disabled={contactActionLoading}
              onClick={onToggleContact}
            >
              {isContact ? "Delete contact" : "Add contact"}
            </button>
          ) : null}
          {showManagement ? (
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
            />
          ) : null}
        </div>
      </article>
    </div>
  );
}
