import type {
  Chat,
  ChatMessage,
  MessageActionDialogState,
} from "@/types";

type MessageActionDialogProps = {
  dialog: MessageActionDialogState;
  chat: Chat;
  currentUserId: number;
  otherUserDisplayName: string;
  alsoForOtherUser: boolean;
  onAlsoForOtherUserChange: (checked: boolean) => void;
  onClose: () => void;
  onConfirmPin: (scope: "me" | "chat" | "unpin") => void;
  onConfirmDelete: (scope: "me" | "chat") => void;
};

function isMessagePinned(entry: ChatMessage) {
  return Boolean(entry.pinned_at || entry.is_pinned_for_me);
}

export function MessageActionDialog({
  dialog,
  chat,
  currentUserId,
  otherUserDisplayName,
  alsoForOtherUser,
  onAlsoForOtherUserChange,
  onClose,
  onConfirmPin,
  onConfirmDelete,
}: MessageActionDialogProps) {
  const { entry } = dialog;
  const isPinned = isMessagePinned(entry);
  const canDeleteForEveryone =
    chat.type !== "direct" || entry.sender_id === currentUserId;

  return (
    <div className="message-action-backdrop" role="presentation" onClick={onClose}>
      <section
        className="message-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={
          dialog.kind === "pin"
            ? isPinned
              ? "Unpin message"
              : "Pin message"
            : "Delete message"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-action-dialog-copy">
          <strong>
            {dialog.kind === "pin"
              ? isPinned
                ? "Would you like to unpin this message?"
                : "Would you like to pin this message?"
              : "Would you like to delete this message?"}
          </strong>
          {dialog.kind === "pin" && chat.type === "direct" && !isPinned ? (
            <label className="message-action-checkbox">
              <input
                type="checkbox"
                checked={alsoForOtherUser}
                onChange={(event) =>
                  onAlsoForOtherUserChange(event.target.checked)
                }
              />
              <span>Also pin for {otherUserDisplayName}</span>
            </label>
          ) : null}
          {dialog.kind === "delete" &&
          chat.type === "direct" &&
          canDeleteForEveryone ? (
            <label className="message-action-checkbox">
              <input
                type="checkbox"
                checked={alsoForOtherUser}
                onChange={(event) =>
                  onAlsoForOtherUserChange(event.target.checked)
                }
              />
              <span>Also delete for {otherUserDisplayName}</span>
            </label>
          ) : null}
          {dialog.kind === "delete" &&
          !(chat.type === "direct" && canDeleteForEveryone) ? (
            <p>
              {chat.type === "direct"
                ? "This will delete the message only for you."
                : "This will delete the message for everyone in this chat."}
            </p>
          ) : null}
        </div>

        <div className="message-action-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          {dialog.kind === "pin" ? (
            isPinned ? (
              <button type="button" onClick={() => onConfirmPin("unpin")}>
                Unpin
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onConfirmPin(
                    chat.type === "direct" && !alsoForOtherUser ? "me" : "chat",
                  )
                }
              >
                Pin
              </button>
            )
          ) : (
            <button
              type="button"
              className="danger"
              onClick={() =>
                onConfirmDelete(
                  chat.type === "direct" &&
                    (!canDeleteForEveryone || !alsoForOtherUser)
                    ? "me"
                    : "chat",
                )
              }
            >
              Delete
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
