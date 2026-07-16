import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type RefObject,
} from "react";
import {
  ClockArrowUp,
  Mic,
  Paperclip,
  Pencil,
  SendHorizontal,
  Smile,
} from "lucide-react";

import { VoiceRecorderControls } from "@/components/chat/VoiceRecorderControls";
import { getMessagePreviewText } from "@/lib/message-helpers";
import type { ChatMessage } from "@/types";

const FILE_MESSAGE_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_COMPOSER_VISIBLE_LINES = 13;
const CURATED_EMOJI_GROUPS = [
  {
    label: "Smileys",
    emojis:
      "😀 😃 😄 😁 😆 😅 😂 🤣 🥹 🥲 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😎 🤓 🧐 🤔 🫡 🤗 🤭 🫢 🫣 🤫 🤐 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 😯 😲 🥳 🤪 😵 😵‍💫 😴 🤤 😷 🤒 🤕 🤢 🤮 🤧 😈 👿 👻 💀 🤖 💩"
        .split(" "),
  },
  {
    label: "People",
    emojis:
      "👍 👎 👏 🙌 🫶 🤝 🙏 💪 👀 👋 🤞 ✌️ 🤟 🤘 👌 🤌 🤙 💅 🫂 🧠 🙋 🙆 🙅 🤷 🙇 🧑‍💻 👩‍💻 👨‍💻 🧑‍🎨 👩‍🎨 👨‍🎨 🧑‍🍳 👩‍🍳 👨‍🍳 🧑‍🚀 👩‍🚀 👨‍🚀"
        .split(" "),
  },
  {
    label: "Nature",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🐔",
      "🐧",
      "🐦",
      "🦋",
      "🐝",
      "🐙",
      "🐬",
      "🌸",
      "🌹",
      "🌻",
      "🌲",
      "🍀",
      "🌈",
    ],
  },
  {
    label: "Food",
    emojis:
      "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🥨 🧀 🍞 🥐 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🍜 🍣 🍤 🍩 🍪 🎂 🍫 🍿 ☕ 🍵 🥤 🍺 🍷 🥂"
        .split(" "),
  },
  {
    label: "Travel",
    emojis:
      "🚗 🚕 🚌 🚎 🏎️ 🚓 🚑 🚒 🚚 🚜 🏍️ 🚲 🛴 🚆 🚇 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🛳️ 🗺️ 🗽 🗼 🏰 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏕️ 🏠 🏢 🌃 🌅 🌉"
        .split(" "),
  },
  {
    label: "Activities",
    emojis:
      "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 🎯 🪀 🪁 🎮 🕹️ 🎲 🧩 ♟️ 🎨 🎭 🎬 🎤 🎧 🎷 🎸 🎹 🥁 🎻 🎪 🎟️ 🎫 🏆 🥇 🥈 🥉 🎉 🎈 🎁"
        .split(" "),
  },
  {
    label: "Objects",
    emojis:
      "⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📺 📻 🎙️ ⏰ ⌛ 🔋 🔌 💡 🔦 🕯️ 🧯 🛒 💳 💰 💎 ⚖️ 🔧 🔨 🪛 🔩 ⚙️ 🧰 🧲 🧪 🧬 🔬 🔭 📚 ✏️ 📝 📌 📎 ✂️ 🔒 🔑"
        .split(" "),
  },
  {
    label: "Symbols",
    emojis:
      "❤️ 🧡 💛 💚 💙 💜 🩷 🖤 🩶 🤍 🤎 💔 ❤️‍🔥 ❤️‍🩹 💯 ✨ ⭐ 🌟 💫 🔥 💥 💦 💨 💬 🗨️ 💤 ✅ ☑️ ✔️ ❌ ❗ ❓ ⁉️ ⚠️ 🔞 ♻️ 🔱 🔔 🎵 🎶 ☮️ ✝️ ☪️ ☯️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓"
        .split(" "),
  },
  {
    label: "Flags",
    emojis:
      "🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🇺🇸 🇬🇧 🇨🇦 🇦🇺 🇩🇪 🇫🇷 🇮🇹 🇪🇸 🇵🇹 🇳🇱 🇧🇪 🇨🇭 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇵🇱 🇺🇦 🇯🇵 🇰🇷 🇨🇳 🇮🇳 🇧🇷 🇲🇽 🇦🇷 🇿🇦 🇹🇷 🇸🇦 🇦🇪"
        .split(" "),
  },
];

const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;
const ADDITIONAL_EMOJI_CATEGORIES = [
  { label: "Activities", ranges: [[0x1f000, 0x1f0ff]] },
  { label: "Symbols", ranges: [[0x1f100, 0x1f2ff]] },
  { label: "Nature", ranges: [[0x1f300, 0x1f3ff]] },
  { label: "Animals", ranges: [[0x1f400, 0x1f4ff]] },
  { label: "Objects", ranges: [[0x1f500, 0x1f5ff]] },
  { label: "Smileys", ranges: [[0x1f600, 0x1f64f]] },
  { label: "Travel", ranges: [[0x1f680, 0x1f6ff]] },
  { label: "Objects", ranges: [[0x1f700, 0x1f77f]] },
  { label: "Symbols", ranges: [[0x1f780, 0x1f8ff]] },
  { label: "People", ranges: [[0x1f900, 0x1f93f]] },
  { label: "Food", ranges: [[0x1f940, 0x1f97f]] },
  { label: "Animals", ranges: [[0x1f980, 0x1f9bf]] },
  { label: "Objects", ranges: [[0x1f9c0, 0x1f9ff]] },
  { label: "Activities", ranges: [[0x1fa00, 0x1fa6f]] },
  { label: "Objects", ranges: [[0x1fa70, 0x1faff]] },
] as const;

function getEmojiGroups() {
  const includedEmojis = new Set(
    CURATED_EMOJI_GROUPS.flatMap((group) => group.emojis),
  );
  const groups = CURATED_EMOJI_GROUPS.flatMap((group) => [
    { label: group.label, emojis: [...group.emojis] },
    ...(group.label === "Nature" ? [{ label: "Animals", emojis: [] }] : []),
  ]);
  const groupsByLabel = new Map(groups.map((group) => [group.label, group]));

  for (const category of ADDITIONAL_EMOJI_CATEGORIES) {
    let group = groupsByLabel.get(category.label);

    if (!group) {
      group = { label: category.label, emojis: [] };
      groupsByLabel.set(category.label, group);
      groups.push(group);
    }

    for (const [start, end] of category.ranges) {
      for (let codePoint = start; codePoint <= end; codePoint += 1) {
        if (
          (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) ||
          (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
        ) {
          continue;
        }

        const emoji = String.fromCodePoint(codePoint);

        if (!EMOJI_PRESENTATION.test(emoji) || includedEmojis.has(emoji)) {
          continue;
        }

        includedEmojis.add(emoji);
        group.emojis.push(emoji);
      }
    }
  }

  return groups;
}

const EMOJI_GROUPS = getEmojiGroups();

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
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!emojiPickerOpen) {
      return undefined;
    }

    const closeEmojiPicker = () => setEmojiPickerOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        closeEmojiPicker();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeEmojiPicker();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiPickerOpen]);

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

  const insertEmojiAtCursor = (emoji: string) => {
    const textarea = messageInputRef.current;
    const selectionStart = textarea?.selectionStart ?? message.length;
    const selectionEnd = textarea?.selectionEnd ?? message.length;
    const nextMessage = `${message.slice(0, selectionStart)}${emoji}${message.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + emoji.length;

    onMessageChange(nextMessage);
    setEmojiPickerOpen(false);

    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursorPosition, nextCursorPosition);
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
                if (emojiPickerOpen) {
                  event.preventDefault();
                  setEmojiPickerOpen(false);
                  return;
                }

                onCancelEdit();
              }
            }}
          />
          <div className="emoji-picker-wrap" ref={emojiPickerRef}>
            <button
              type="button"
              className="emoji-picker-button"
              aria-label="Choose an emoji"
              aria-expanded={emojiPickerOpen}
              aria-haspopup="dialog"
              title="Choose an emoji"
              disabled={!canSendTextMessages}
              onClick={() => setEmojiPickerOpen((current) => !current)}
            >
              <Smile aria-hidden="true" size={18} />
            </button>
            {emojiPickerOpen ? (
              <div
                className="emoji-picker"
                role="dialog"
                aria-label="Emoji picker"
              >
                {EMOJI_GROUPS.map((group) => (
                  <section className="emoji-picker-group" key={group.label}>
                    <strong>{group.label}</strong>
                    <div className="emoji-picker-grid">
                      {group.emojis.map((emoji) => (
                        <button
                          type="button"
                          key={emoji}
                          aria-label={`Insert ${emoji}`}
                          title={emoji}
                          onClick={() => insertEmojiAtCursor(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
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
            className={[
              "send-button",
              isEditing ? "text text-action-button" : "",
            ]
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
