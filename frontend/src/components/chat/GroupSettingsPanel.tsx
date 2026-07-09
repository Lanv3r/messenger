import { Button } from "@/components/ui/button";
import {
  MEMBER_BOOLEAN_PERMISSION_KEYS,
  MEMBER_NUMERIC_PERMISSION_KEYS,
  PERMISSION_LABELS,
} from "@/lib/permissions";
import type { MemberPermissions } from "@/types";

type GroupSettingsPanelProps = {
  canManageMembers: boolean;
  permissionsDraft: MemberPermissions | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  message: string | null;
  onClose: () => void;
  onBooleanPermissionChange: (key: string, value: boolean) => void;
  onNumericPermissionChange: (key: string, value: number) => void;
  onSave: () => void;
};

export function GroupSettingsPanel({
  canManageMembers,
  permissionsDraft,
  loading,
  saving,
  error,
  message,
  onClose,
  onBooleanPermissionChange,
  onNumericPermissionChange,
  onSave,
}: GroupSettingsPanelProps) {
  return (
    <div className="chat-info-nested-backdrop" role="presentation" onClick={onClose}>
      <section
        className="chat-info-nested-panel permissions-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Manage group"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-info-nested-header">
          <div>
            <strong>Manage</strong>
            <span>Default member permissions for this group.</span>
          </div>
          <button type="button" aria-label="Close manage" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="permissions-panel-header">
          <div>
            <strong>Default member permissions</strong>
            <span>
              Applies to all members. Editing this requires the ban-users
              permission.
            </span>
          </div>
          {loading ? <small>Loading...</small> : null}
        </div>

        {permissionsDraft ? (
          <div className="permission-list">
            {MEMBER_BOOLEAN_PERMISSION_KEYS.map((key) => (
              <label className="permission-row" key={key}>
                <span>{PERMISSION_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={permissionsDraft[key] === true}
                  disabled={!canManageMembers}
                  onChange={(event) =>
                    onBooleanPermissionChange(key, event.target.checked)
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
                  value={Number(permissionsDraft[key] ?? 0)}
                  disabled={!canManageMembers}
                  onChange={(event) =>
                    onNumericPermissionChange(key, Number(event.target.value))
                  }
                />
              </label>
            ))}
          </div>
        ) : loading ? null : (
          <p className="message-search-empty">
            Permission defaults are not loaded.
          </p>
        )}

        {error ? <p className="profile-error">{error}</p> : null}
        {message ? <p className="profile-success">{message}</p> : null}
        <Button type="button" size="sm" disabled={saving || !permissionsDraft} onClick={onSave}>
          {saving ? "Saving..." : "Save member defaults"}
        </Button>
      </section>
    </div>
  );
}
