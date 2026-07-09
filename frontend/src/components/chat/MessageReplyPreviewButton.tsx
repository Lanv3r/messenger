import { getReplyPreviewText } from "@/lib/message-helpers";
import type { MessageReplyPreview } from "@/types";

type MessageReplyPreviewButtonProps = {
  reply: MessageReplyPreview;
  getSenderName: (reply: MessageReplyPreview) => string;
  onRevealMessage: (messageId: number) => void;
};

export function MessageReplyPreviewButton({
  reply,
  getSenderName,
  onRevealMessage,
}: MessageReplyPreviewButtonProps) {
  const isDeleted = reply.message_type === "deleted";

  return (
    <button
      type="button"
      className={[
        "message-reply-preview",
        isDeleted ? "deleted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isDeleted}
      onClick={() => {
        if (!isDeleted) {
          onRevealMessage(reply.id);
        }
      }}
    >
      <span className="message-reply-author">{getSenderName(reply)}</span>
      <span className="message-reply-text">
        {getReplyPreviewText(reply)}
      </span>
    </button>
  );
}
