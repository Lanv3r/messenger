import type { ChangeEvent, ClipboardEvent, RefObject } from "react";
import { ClockArrowUp, Mic, Paperclip } from "lucide-react";

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
  replyToMessage: ChatMessage | null;
  voiceRecorder: MediaRecorder | null;
  voiceRecordingElapsedMs: number;
  fileSending: boolean;
  voiceSending: boolean;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasteImages: (event: ClipboardEvent<HTMLInputElement>) => void;
  onRevealMessage: (messageId: number) => void;
  onCancelReply: () => void;
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
  replyToMessage,
  voiceRecorder,
  voiceRecordingElapsedMs,
  fileSending,
  voiceSending,
  onFileInputChange,
  onPasteImages,
  onRevealMessage,
  onCancelReply,
  onCancelVoiceRecording,
  onSendVoiceRecording,
  onMessageChange,
  onSend,
  onStartVoiceRecording,
  getSenderName,
}: ChatComposerProps) {
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
      {replyToMessage ? (
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
          fileSending
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
          voiceSending
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
          (activeChatId === null && !hasDraftRecipient) || voiceRecorder !== null
        }
      >
        Send
      </button>
    </div>
  );
}
