import type { ChangeEvent, ClipboardEvent, RefObject } from "react";
import { ClockArrowUp, Mic, Paperclip, Pencil } from "lucide-react";

import { VoiceRecorderControls } from "@/components/chat/VoiceRecorderControls";
import { getMessagePreviewText } from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

const FILE_MESSAGE_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ChatComposerProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  activeChatId: number | null;
  hasDraftRecipient: boolean;
  message: string;
  editingMessage: ChatMessage | null;
  editingMessageSaving: boolean;
  replyToMessage: ChatMessage | null;
  voiceRecorder: MediaRecorder | null;
  voiceRecordingElapsedMs: number;
  fileSending: boolean;
  voiceSending: boolean;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasteImages: (event: ClipboardEvent<HTMLInputElement>) => void;
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
  activeChatId,
  hasDraftRecipient,
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

  return (
    <div className="composer">
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        multiple
        accept={FILE_MESSAGE_ACCEPT}
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
      {voiceRecorder ? (
        <VoiceRecorderControls
          elapsedMs={voiceRecordingElapsedMs}
          onCancel={onCancelVoiceRecording}
          onSend={onSendVoiceRecording}
        />
      ) : null}
      <input
        id="message"
        type="text"
        value={message}
        placeholder="Write a message..."
        disabled={voiceRecorder !== null}
        onChange={(event) => onMessageChange(event.target.value)}
        onPaste={onPasteImages}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
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
          voiceRecorder !== null ||
          fileSending ||
          editingMessageSaving
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
        title={voiceSending ? "Uploading voice message" : "Record voice message"}
        disabled={
          activeChatId === null ||
          hasDraftRecipient ||
          voiceRecorder !== null ||
          voiceSending ||
          isEditing
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
        className="send-button"
        onClick={onSend}
        disabled={
          (activeChatId === null && !hasDraftRecipient) ||
          voiceRecorder !== null ||
          editingMessageSaving
        }
      >
        {isEditing ? (editingMessageSaving ? "Saving..." : "Save") : "Send"}
      </button>
    </div>
  );
}
