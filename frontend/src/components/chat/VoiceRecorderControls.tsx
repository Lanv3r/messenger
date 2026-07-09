import { formatVoiceDuration } from "@/lib/message-helpers";

type VoiceRecorderControlsProps = {
  elapsedMs: number;
  onCancel: () => void;
  onSend: () => void;
};

export function VoiceRecorderControls({
  elapsedMs,
  onCancel,
  onSend,
}: VoiceRecorderControlsProps) {
  return (
    <div className="voice-recording-panel">
      <span>Recording voice message · {formatVoiceDuration(elapsedMs)}</span>
      <button type="button" className="voice-cancel-button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onSend}>
        Send voice
      </button>
    </div>
  );
}
