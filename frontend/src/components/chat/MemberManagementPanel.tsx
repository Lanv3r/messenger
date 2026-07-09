import { Button } from "@/components/ui/button";
import {
  ADMIN_PERMISSION_KEYS,
  MEMBER_BOOLEAN_PERMISSION_KEYS,
  MEMBER_NUMERIC_PERMISSION_KEYS,
  PERMISSION_LABELS,
} from "@/lib/permissions";
import type {
  AdminPermissions,
  ChatMember,
  MemberManagementMode,
  MemberPermissions,
} from "@/types";

type MemberManagementPanelProps = {
  member: ChatMember;
  currentUserId: number;
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
  onModeChange: (mode: MemberManagementMode) => void;
  onSelectedMemberBooleanPermissionChange: (key: string, value: boolean) => void;
  onSelectedMemberNumericPermissionChange: (key: string, value: number) => void;
  onAdminPermissionChange: (memberId: number, key: string, value: boolean) => void;
  onSaveSelectedMemberPermissions: () => void;
  onPromoteSelectedMember: () => void;
  onSaveSelectedAdminPermissions: () => void;
  onDismissSelectedAdmin: () => void;
  onStartRemoveMember: () => void;
};

export function MemberManagementPanel({
  member,
  currentUserId,
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
  onModeChange,
  onSelectedMemberBooleanPermissionChange,
  onSelectedMemberNumericPermissionChange,
  onAdminPermissionChange,
  onSaveSelectedMemberPermissions,
  onPromoteSelectedMember,
  onSaveSelectedAdminPermissions,
  onDismissSelectedAdmin,
  onStartRemoveMember,
}: MemberManagementPanelProps) {
  return (
    <section className="member-permissions-card">
      <div className="member-permissions-header">
        <div>
          <strong>{member.role}</strong>
          <span>Group role</span>
        </div>
        {adminPermissionsLoading ? <small>Loading rights...</small> : null}
      </div>

      {member.role === "owner" ? (
        <p className="permissions-note">
          Owners have all rights and cannot be managed here.
        </p>
      ) : null}

      {hasActions ? (
        <div className="member-management-actions">
          {member.role === "member" && canPromoteMember ? (
            <Button type="button" size="sm" onClick={() => onModeChange("admin")}>
              Promote to admin
            </Button>
          ) : null}
          {member.role === "admin" ? (
            <Button type="button" size="sm" onClick={() => onModeChange("admin")}>
              {canEditAdmin ? "Edit admin rights" : "View admin rights"}
            </Button>
          ) : null}
          {canEditMemberPermissions ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onModeChange("member")}
            >
              Restrict member rights
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "member" ? (
        <div className="member-rights-section">
          <div className="member-editor-header">
            <div>
              <strong>Restrict member rights</strong>
              <span>Default-disabled rights are locked for everyone.</span>
            </div>
            <button type="button" onClick={() => onModeChange(null)}>
              Back
            </button>
          </div>

          {selectedMemberPermissionsDraft ? (
            <div className="permission-list compact">
              {MEMBER_BOOLEAN_PERMISSION_KEYS.map((key) => {
                const lockedByDefault = memberPermissionIsLockedByDefault(key);

                return (
                  <label className="permission-row" key={key}>
                    <span>
                      {PERMISSION_LABELS[key]}
                      {lockedByDefault ? (
                        <small>Locked by group default</small>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedMemberPermissionsDraft[key] === true}
                      disabled={
                        lockedByDefault ||
                        !canEditMemberPermissions ||
                        selectedMemberPermissionsSaving
                      }
                      onChange={(event) =>
                        onSelectedMemberBooleanPermissionChange(
                          key,
                          event.target.checked,
                        )
                      }
                    />
                  </label>
                );
              })}
              {MEMBER_NUMERIC_PERMISSION_KEYS.map((key) => {
                const defaultValue = Number(
                  (memberPermissionsDraft ?? memberPermissions)?.[key] ?? 0,
                );

                return (
                  <label className="permission-row" key={key}>
                    <span>
                      {PERMISSION_LABELS[key]}
                      {defaultValue > 0 ? (
                        <small>Group minimum {defaultValue}s</small>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      min={defaultValue}
                      step="1"
                      value={Number(
                        selectedMemberPermissionsDraft[key] ?? defaultValue,
                      )}
                      disabled={
                        !canEditMemberPermissions ||
                        selectedMemberPermissionsSaving
                      }
                      onChange={(event) =>
                        onSelectedMemberNumericPermissionChange(
                          key,
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="permissions-note">Member rights are not loaded.</p>
          )}

          {member.role === "admin" && canEditMemberPermissions ? (
            <p className="permissions-note">
              Reducing an admin&apos;s member rights demotes them to member.
            </p>
          ) : null}
          {selectedMemberPermissionsError ? (
            <p className="profile-error">{selectedMemberPermissionsError}</p>
          ) : null}
          {selectedMemberPermissionsMessage ? (
            <p className="profile-success">{selectedMemberPermissionsMessage}</p>
          ) : null}
          {canEditMemberPermissions ? (
            <Button
              type="button"
              size="sm"
              disabled={
                selectedMemberPermissionsSaving ||
                !selectedMemberPermissionsDraft
              }
              onClick={onSaveSelectedMemberPermissions}
            >
              {selectedMemberPermissionsSaving ? "Saving..." : "Save member rights"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "admin" &&
      (member.role === "admin" || member.role === "member") ? (
        <div className="member-rights-section">
          <div className="member-editor-header">
            <div>
              <strong>
                {member.role === "member" ? "Promote to admin" : "Admin rights"}
              </strong>
              <span>Select the admin rights this user should have.</span>
            </div>
            <button type="button" onClick={() => onModeChange(null)}>
              Back
            </button>
          </div>

          <div className="permission-list compact">
            {ADMIN_PERMISSION_KEYS.map((key) => {
              const forcedByMemberDefault =
                adminPermissionIsForcedByMemberDefault(key);
              const canChangePermission =
                member.role === "member" ? canPromoteMember : canEditAdmin;

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
                      onAdminPermissionChange(
                        member.user_id,
                        key,
                        event.target.checked,
                      )
                    }
                  />
                </label>
              );
            })}
          </div>

          {adminPermissionsError ? (
            <p className="profile-error">{adminPermissionsError}</p>
          ) : null}
          {adminPermissionsMessage ? (
            <p className="profile-success">{adminPermissionsMessage}</p>
          ) : null}

          {member.role === "member" && canPromoteMember ? (
            <Button
              type="button"
              size="sm"
              disabled={selectedMemberPermissionIsSaving}
              onClick={onPromoteSelectedMember}
            >
              {selectedMemberPermissionIsSaving ? "Promoting..." : "Promote to admin"}
            </Button>
          ) : null}

          {member.role === "admin" ? (
            <div className="member-permissions-actions">
              {canEditAdmin ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={selectedMemberPermissionIsSaving}
                    onClick={onSaveSelectedAdminPermissions}
                  >
                    {selectedMemberPermissionIsSaving ? "Saving..." : "Save admin rights"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedMemberPermissionIsSaving}
                    onClick={onDismissSelectedAdmin}
                  >
                    Dismiss admin
                  </Button>
                </>
              ) : member.user_id === currentUserId ? (
                <p className="permissions-note">
                  You can view your admin rights, but not edit them.
                </p>
              ) : (
                <p className="permissions-note">
                  Backend permission checks decide whether you can manage this admin.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {memberRemovalError ? (
        <p className="profile-error">{memberRemovalError}</p>
      ) : null}
      {memberRemovalMessage ? (
        <p className="profile-success">{memberRemovalMessage}</p>
      ) : null}
      {canRemoveMember ? (
        <div className="member-danger-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedMemberRemovalIsSaving}
            onClick={onStartRemoveMember}
          >
            {selectedMemberRemovalIsSaving ? "Removing..." : "Remove from group"}
          </Button>
        </div>
      ) : member.user_id !== currentUserId && member.role !== "owner" ? (
        <p className="permissions-note">
          You need the ban-users permission to remove members.
        </p>
      ) : null}
    </section>
  );
}
