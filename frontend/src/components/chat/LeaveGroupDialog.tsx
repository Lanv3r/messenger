type LeaveGroupDialogProps = {
  leaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function LeaveGroupDialog({
  leaving,
  onClose,
  onConfirm,
}: LeaveGroupDialogProps) {
  return (
    <div
      className="message-action-backdrop"
      role="presentation"
      onClick={leaving ? undefined : onClose}
    >
      <section
        className="message-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-group-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-action-dialog-copy">
          <strong id="leave-group-title">
            Are you sure you want to leave this group?
          </strong>
        </div>
        <div className="message-action-dialog-actions">
          <button
            type="button"
            className="text-action-button"
            disabled={leaving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            disabled={leaving}
            onClick={onConfirm}
          >
            {leaving ? "Leaving..." : "Leave"}
          </button>
        </div>
      </section>
    </div>
  );
}
