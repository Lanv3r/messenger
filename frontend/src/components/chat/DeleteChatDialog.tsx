import type { Chat } from "@/types";

type DeleteChatDialogProps = {
  chat: Chat;
  deleting: boolean;
  deleteMessagesForEveryone: boolean;
  onDeleteMessagesForEveryoneChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
};

function getDeleteMessagesPrompt(chat: Chat) {
  if (chat.type === "direct") {
    return `Do you also want to delete your messages for ${chat.display_title}?`;
  }

  if (chat.type === "group" && chat.member_count >= 2) {
    return "Do you also want to delete your messages for everyone?";
  }

  return null;
}

function clearsGroupHistory(chat: Chat) {
  return chat.type === "group" && chat.member_count >= 2;
}

export function DeleteChatDialog({
  chat,
  deleting,
  deleteMessagesForEveryone,
  onDeleteMessagesForEveryoneChange,
  onClose,
  onConfirm,
}: DeleteChatDialogProps) {
  const deleteMessagesPrompt = getDeleteMessagesPrompt(chat);
  const clearHistory = clearsGroupHistory(chat);

  return (
    <div
      className="message-action-backdrop"
      role="presentation"
      onClick={deleting ? undefined : onClose}
    >
      <section
        className="message-action-dialog delete-chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-chat-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-action-dialog-copy">
          <strong id="delete-chat-title">
            {clearHistory ? "Clear this chat's history?" : "Delete this chat?"}
          </strong>
          <p>
            {clearHistory
              ? "This removes the previous messages from your view. The group stays in your chat list."
              : "This removes the chat and its previous history from your chat list."}
          </p>
        </div>
        {deleteMessagesPrompt ? (
          <label className="message-action-checkbox">
            <input
              type="checkbox"
              checked={deleteMessagesForEveryone}
              disabled={deleting}
              onChange={(event) =>
                onDeleteMessagesForEveryoneChange(event.target.checked)
              }
            />
            <span>{deleteMessagesPrompt}</span>
          </label>
        ) : null}
        <div className="message-action-dialog-actions">
          <button type="button" disabled={deleting} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="danger"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting
              ? (clearHistory ? "Clearing..." : "Deleting...")
              : (clearHistory ? "Clear history" : "Delete")}
          </button>
        </div>
      </section>
    </div>
  );
}
