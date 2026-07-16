import { useState } from "react";

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
  UserProfile,
} from "@/types";

function formatPromotionTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "an unknown time";
  }

  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(timestamp);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);

  return `${date} at ${time}`;
}

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
  getChatMemberDisplayName: (member: ChatMember) => string;
  onModeChange: (mode: MemberManagementMode) => void;
  onSelectedMemberBooleanPermissionChange: (key: string, value: boolean) => void;
  onSelectedMemberNumericPermissionChange: (key: string, value: number) => void;
  onAdminPermissionChange: (memberId: number, key: string, value: boolean) => void;
  onSaveSelectedMemberPermissions: () => void;
  onPromoteSelectedMember: () => void;
  onSaveSelectedAdminPermissions: () => void;
  onDismissSelectedAdmin: () => Promise<boolean>;
  onStartRemoveMember: () => void;
  onViewPromoterProfile: (profile: UserProfile) => void;
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
  getChatMemberDisplayName,
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
}: MemberManagementPanelProps) {
  const [dismissConfirmationOpen, setDismissConfirmationOpen] =
    useState(false);

  if (mode === "member") {
    return (
      <section className="member-permissions-card member-permissions-editor-card member-rights-editor">
        <p className="member-permissions-prompt">What can this member do?</p>

        {selectedMemberPermissionsDraft ? (
          <div className="permission-list compact">
            {MEMBER_BOOLEAN_PERMISSION_KEYS.map((key) => {
              const lockedByDefault = memberPermissionIsLockedByDefault(key);

              return (
                <label className="permission-row" key={key}>
                  <span>
                    {PERMISSION_LABELS[key]}
                    {lockedByDefault ? (
                      <small className="permission-member-default-note">
                        Locked by group default
                      </small>
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

        {selectedMemberPermissionsError ? (
          <p className="profile-error">{selectedMemberPermissionsError}</p>
        ) : null}
        {selectedMemberPermissionsMessage ? (
          <p className="profile-success">{selectedMemberPermissionsMessage}</p>
        ) : null}
        <div className="member-permissions-editor-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-action-button"
            disabled={selectedMemberPermissionsSaving}
            onClick={() => onModeChange(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-action-button"
            disabled={
              selectedMemberPermissionsSaving ||
              !selectedMemberPermissionsDraft ||
              !canEditMemberPermissions
            }
            onClick={onSaveSelectedMemberPermissions}
          >
            {selectedMemberPermissionsSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </section>
    );
  }

  if (
    mode === "admin" &&
    (member.role === "admin" || member.role === "member")
  ) {
    const canSaveAdminPermissions =
      member.role === "member" ? canPromoteMember : canEditAdmin;
    const canDismissAdmin = member.role === "admin" && canEditAdmin;
    const handleDismissAdmin = async () => {
      if (await onDismissSelectedAdmin()) {
        setDismissConfirmationOpen(false);
        onModeChange(null);
      }
    };
    const closeDismissConfirmation = () => {
      if (!selectedMemberPermissionIsSaving) {
        setDismissConfirmationOpen(false);
      }
    };

    return (
      <section className="member-permissions-card member-permissions-editor-card">
        {member.role === "admin" &&
        member.promoted_by_user &&
        member.promoted_at ? (
          <p className="admin-promotion-info">
            Promoted by{" "}
            <button
              type="button"
              onClick={() => onViewPromoterProfile(member.promoted_by_user!)}
            >
              {member.promoted_by_user.username}
            </button>{" "}
            on {formatPromotionTimestamp(member.promoted_at)}.
          </p>
        ) : null}
        <p className="member-permissions-prompt">What can this admin do?</p>

        <div className="permission-list compact">
          {ADMIN_PERMISSION_KEYS.map((key) => {
            const forcedByMemberDefault =
              adminPermissionIsForcedByMemberDefault(key);

            return (
              <label className="permission-row" key={key}>
                <span>
                  {PERMISSION_LABELS[key]}
                  {forcedByMemberDefault ? (
                    <small className="permission-member-default-note">
                      Enabled for all members
                    </small>
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
                    !canSaveAdminPermissions ||
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

        <p className="admin-rights-summary">
          This admin will {selectedAdminPermissions?.manage_admins === true ? "" : "not "}
          be able to add new admins.
        </p>

        {canDismissAdmin ? (
          <div className="admin-dismiss-action">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="admin-dismiss-button"
              disabled={selectedMemberPermissionIsSaving}
              onClick={() => setDismissConfirmationOpen(true)}
            >
              Dismiss Admin
            </Button>
          </div>
        ) : null}

        {dismissConfirmationOpen ? (
          <div
            className="message-action-backdrop"
            role="presentation"
            onClick={closeDismissConfirmation}
          >
            <section
              className="message-action-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Dismiss admin"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="message-action-dialog-copy">
                <strong>
                  Remove {getChatMemberDisplayName(member)} from admins?
                </strong>
              </div>

              <div className="message-action-dialog-actions">
                <button
                  type="button"
                  className="text-action-button"
                  disabled={selectedMemberPermissionIsSaving}
                  onClick={closeDismissConfirmation}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={selectedMemberPermissionIsSaving}
                  onClick={() => void handleDismissAdmin()}
                >
                  {selectedMemberPermissionIsSaving ? "Removing..." : "Remove"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {adminPermissionsError ? (
          <p className="profile-error">{adminPermissionsError}</p>
        ) : null}
        {adminPermissionsMessage ? (
          <p className="profile-success">{adminPermissionsMessage}</p>
        ) : null}
        <div className="member-permissions-editor-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-action-button"
            disabled={selectedMemberPermissionIsSaving}
            onClick={() => onModeChange(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-action-button"
            disabled={
              selectedMemberPermissionIsSaving || !canSaveAdminPermissions
            }
            onClick={
              member.role === "member"
                ? onPromoteSelectedMember
                : onSaveSelectedAdminPermissions
            }
          >
            {selectedMemberPermissionIsSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </section>
    );
  }

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
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => onModeChange("admin")}
              >
                {canEditAdmin ? "Edit admin rights" : "View admin rights"}
              </Button>
            </>
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
