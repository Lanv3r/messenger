import type { ChatMember } from "@/types";

type MemberRemovalDialogProps = {
  member: ChatMember;
  removing: boolean;
  getDisplayName: (member: ChatMember) => string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MemberRemovalDialog({
  member,
  removing,
  getDisplayName,
  onCancel,
  onConfirm,
}: MemberRemovalDialogProps) {
  return (
    <div className="message-action-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="message-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Remove group member"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-action-dialog-copy">
          <strong>
            Are you sure you want to remove {getDisplayName(member)}?
          </strong>
          <p>
            They will lose access to this group until someone adds them again.
          </p>
        </div>

        <div className="message-action-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            disabled={removing}
            onClick={onConfirm}
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </section>
    </div>
  );
}
