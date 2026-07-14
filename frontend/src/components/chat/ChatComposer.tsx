import {
  useEffect,
  type ChangeEvent,
  type ClipboardEvent,
  type RefObject,
} from "react";
import { ClockArrowUp, Mic, Paperclip, Pencil, SendHorizontal } from "lucide-react";

import { VoiceRecorderControls } from "@/components/chat/VoiceRecorderControls";
import { getMessagePreviewText } from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

const FILE_MESSAGE_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_COMPOSER_VISIBLE_LINES = 13;

type ChatComposerProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  messageInputRef: RefObject<HTMLTextAreaElement | null>;
  activeChatId: number | null;
  hasDraftRecipient: boolean;
  isMessagingBlocked: boolean;
  canSendTextMessages: boolean;
  message: string;
  editingMessage: ChatMessage | null;
  editingMessageSaving: boolean;
  replyToMessage: ChatMessage | null;
  voiceRecorder: MediaRecorder | null;
  voiceRecordingElapsedMs: number;
  fileSending: boolean;
  voiceSending: boolean;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasteImages: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onRevealMessage: (messageId: number) => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onCancelVoiceRecording: () => void;
  onSendVoiceRecording: () => void;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onStartVoiceRecording: () => void;
  getSenderName: (entry: ChatMessage) => string;
};

export function ChatComposer({
  fileInputRef,
  messageInputRef,
  activeChatId,
  hasDraftRecipient,
  isMessagingBlocked,
  canSendTextMessages,
  message,
  editingMessage,
  editingMessageSaving,
  replyToMessage,
  voiceRecorder,
  voiceRecordingElapsedMs,
  fileSending,
  voiceSending,
  onFileInputChange,
  onPasteImages,
  onRevealMessage,
  onCancelReply,
  onCancelEdit,
  onCancelVoiceRecording,
  onSendVoiceRecording,
  onMessageChange,
  onSend,
  onStartVoiceRecording,
  getSenderName,
}: ChatComposerProps) {
  const isEditing = editingMessage !== null;

  useEffect(() => {
    const textarea = messageInputRef.current;

    if (!textarea) {
      return;
    }

    const style = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const lineHeight =
      Number.parseFloat(style.lineHeight) || fontSize * 1.35;
    const verticalPadding =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const verticalBorder =
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    const maxHeight =
      lineHeight * MAX_COMPOSER_VISIBLE_LINES +
      verticalPadding +
      verticalBorder;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message, messageInputRef]);

  const insertNewlineAtCursor = (textarea: HTMLTextAreaElement) => {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextMessage = `${textarea.value.slice(0, selectionStart)}\n${textarea.value.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + 1;

    onMessageChange(nextMessage);
    window.requestAnimationFrame(() => {
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  return (
    <div className="composer">
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        multiple
        accept={FILE_MESSAGE_ACCEPT}
        disabled={isMessagingBlocked}
        onChange={onFileInputChange}
      />
      {isEditing ? (
        <div className="composer-reply-preview composer-edit-preview">
          <button
            type="button"
            className="composer-reply-main"
            onClick={() => onRevealMessage(editingMessage.id)}
          >
            <span>
              <Pencil
                className="composer-edit-icon"
                size={24}
                aria-hidden="true"
              />
              <span className="composer-edit-copy">
                <strong>Edit message</strong>
                <span>{getMessagePreviewText(editingMessage)}</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            className="composer-reply-cancel"
            aria-label="Cancel edit"
            onClick={onCancelEdit}
          >
            &times;
          </button>
        </div>
      ) : replyToMessage ? (
        <div className="composer-reply-preview">
          <button
            type="button"
            className="composer-reply-main"
            onClick={() => onRevealMessage(replyToMessage.id)}
          >
            <span>
              Replying to <strong>{getSenderName(replyToMessage)}</strong>
            </span>
            <span>{getMessagePreviewText(replyToMessage)}</span>
          </button>
          <button
            type="button"
            className="composer-reply-cancel"
            aria-label="Cancel reply"
            onClick={onCancelReply}
          >
            &times;
          </button>
        </div>
      ) : null}
      {voiceRecorder && !isMessagingBlocked ? (
        <VoiceRecorderControls
          elapsedMs={voiceRecordingElapsedMs}
          onCancel={onCancelVoiceRecording}
          onSend={onSendVoiceRecording}
        />
      ) : (
        <>
          <textarea
            ref={messageInputRef}
            id="message"
            rows={1}
            value={message}
            placeholder={
              isMessagingBlocked
                ? "You cannot message this user"
                : !canSendTextMessages
                  ? "You do not have permission to send messages"
                : "Write a message..."
            }
            disabled={!canSendTextMessages}
            onChange={(event) => onMessageChange(event.target.value)}
            onPaste={onPasteImages}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (event.metaKey || event.ctrlKey || event.shiftKey) {
                  event.preventDefault();
                  insertNewlineAtCursor(event.currentTarget);
                  return;
                }

                event.preventDefault();
                onSend();
                return;
              }

              if (event.key === "Escape" && isEditing) {
                onCancelEdit();
              }
            }}
          />
          <button
            type="button"
            className="attachment-button"
            aria-label={fileSending ? "Uploading file" : "Attach file"}
            title={fileSending ? "Uploading file" : "Attach file"}
            disabled={
              activeChatId === null ||
              hasDraftRecipient ||
              fileSending ||
              editingMessageSaving ||
              isMessagingBlocked
            }
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            {fileSending ? (
              <ClockArrowUp aria-hidden="true" size={18} />
            ) : (
              <Paperclip aria-hidden="true" size={18} />
            )}
          </button>
          <button
            type="button"
            className="voice-record-button"
            aria-label={
              voiceSending ? "Uploading voice message" : "Record voice message"
            }
            title={
              voiceSending ? "Uploading voice message" : "Record voice message"
            }
            disabled={
              activeChatId === null ||
              hasDraftRecipient ||
              voiceSending ||
              isEditing ||
              isMessagingBlocked
            }
            onClick={onStartVoiceRecording}
          >
            {voiceSending ? (
              <ClockArrowUp aria-hidden="true" size={18} />
            ) : (
              <Mic aria-hidden="true" size={18} />
            )}
          </button>
          <button
            type="button"
            className={["send-button", isEditing ? "text" : ""]
              .filter(Boolean)
              .join(" ")}
            aria-label={isEditing ? "Save edited message" : "Send message"}
            title={isEditing ? "Save edited message" : "Send message"}
            onClick={onSend}
            disabled={
              (activeChatId === null && !hasDraftRecipient) ||
              editingMessageSaving ||
              !canSendTextMessages
            }
          >
            {isEditing ? (
              editingMessageSaving ? (
                "Saving..."
              ) : (
                "Save"
              )
            ) : (
              <SendHorizontal aria-hidden="true" size={19} />
            )}
          </button>
        </>
      )}
    </div>
  );
}
