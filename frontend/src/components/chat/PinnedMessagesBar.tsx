import { Pin, X } from "lucide-react";

import { getMessagePreviewText } from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

type PinnedMessagesBarProps = {
  messages: ChatMessage[];
  canUnpinMessage: (entry: ChatMessage) => boolean;
  onRequestUnpin: (entry: ChatMessage) => void;
  onRevealMessage: (messageId: number) => void;
};

function getPinTimestamp(entry: ChatMessage) {
  return entry.pinned_at ?? entry.created_at ?? "";
}

export function PinnedMessagesBar({
  messages,
  canUnpinMessage,
  onRequestUnpin,
  onRevealMessage,
}: PinnedMessagesBarProps) {
  const pinnedMessages = messages
    .filter((entry) => entry.pinned_at || entry.is_pinned_for_me)
    .sort((first, second) =>
      getPinTimestamp(second).localeCompare(getPinTimestamp(first)),
    );
  const pinnedMessage = pinnedMessages[0];

  if (!pinnedMessage) {
    return null;
  }
  const canUnpin = canUnpinMessage(pinnedMessage);

  return (
    <section className="pinned-messages-bar" aria-label="Pinned messages">
      <div className="pinned-messages-heading">
        <Pin size={15} aria-hidden="true" />
        <span>
          {pinnedMessages.length === 1
            ? "Pinned message"
            : `${pinnedMessages.length} pinned messages`}
        </span>
      </div>
      <button
        type="button"
        className="pinned-message-card"
        onClick={() => onRevealMessage(pinnedMessage.id)}
      >
        <span>{getMessagePreviewText(pinnedMessage)}</span>
      </button>
      {canUnpin ? (
        <button
          type="button"
          className="pinned-message-unpin-button"
          aria-label="Unpin message"
          title="Unpin"
          onClick={(event) => {
            event.stopPropagation();
            onRequestUnpin(pinnedMessage);
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
