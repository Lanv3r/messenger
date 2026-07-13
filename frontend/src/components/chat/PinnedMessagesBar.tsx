import { useMemo } from "react";
import { Pin, X } from "lucide-react";

import { getMessagePreviewText } from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

type PinnedMessagesBarProps = {
  messages: ChatMessage[];
  activePinnedMessageId: number | null;
  canUnpinMessage: (entry: ChatMessage) => boolean;
  onRequestUnpin: (entry: ChatMessage) => void;
  onRevealMessage: (
    messageId: number,
    options?: { nextActivePinnedMessageId: number | null },
  ) => void;
};

function getSentTimestamp(entry: ChatMessage) {
  return entry.created_at ?? "";
}

export function PinnedMessagesBar({
  messages,
  activePinnedMessageId,
  canUnpinMessage,
  onRequestUnpin,
  onRevealMessage,
}: PinnedMessagesBarProps) {
  const pinnedMessages = useMemo(
    () =>
      messages
        .filter((entry) => entry.pinned_at || entry.is_pinned_for_me)
        .sort((first, second) =>
          getSentTimestamp(first).localeCompare(getSentTimestamp(second)),
    ),
    [messages],
  );
  const activePinnedIndex = pinnedMessages.findIndex(
    (entry) => entry.id === activePinnedMessageId,
  );
  const visiblePinnedIndex = activePinnedIndex >= 0 ? activePinnedIndex : 0;
  const pinnedMessage = pinnedMessages[visiblePinnedIndex];

  if (!pinnedMessage) {
    return null;
  }

  const canUnpin = canUnpinMessage(pinnedMessage);
  const segmentCount = Math.min(pinnedMessages.length, 4);
  const activeSegmentIndex =
    pinnedMessages.length <= 1
      ? 0
      : Math.min(
          segmentCount - 1,
          Math.floor((visiblePinnedIndex * segmentCount) / pinnedMessages.length),
        );

  function revealAndSwitchPinnedMessage() {
    onRevealMessage(pinnedMessage.id, {
      nextActivePinnedMessageId:
        visiblePinnedIndex === 0 && pinnedMessages.length > 1
          ? pinnedMessages[pinnedMessages.length - 1].id
          : null,
    });
  }

  return (
    <section
      className="pinned-messages-bar"
      aria-label={`Pinned message ${visiblePinnedIndex + 1} of ${pinnedMessages.length}`}
      onClick={revealAndSwitchPinnedMessage}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          revealAndSwitchPinnedMessage();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="pinned-message-segments" aria-hidden="true">
        {Array.from({ length: segmentCount }, (_, index) => (
          <span
            className={index === activeSegmentIndex ? "active" : undefined}
            key={index}
          />
        ))}
      </div>
      <div className="pinned-messages-heading">
        <Pin size={15} aria-hidden="true" />
        <span>Pinned message #{visiblePinnedIndex + 1}</span>
      </div>
      <div className="pinned-message-card">
        <span>{getMessagePreviewText(pinnedMessage)}</span>
      </div>
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
