import { useEffect, useRef, useState } from "react";

type VoiceRecordingResult = {
  blob: Blob;
  durationMs: number;
  chatId: number | null;
};

type UseVoiceRecorderOptions = {
  onActivityChange: (chatId: number | null, isRecording: boolean) => void;
  onError: (message: string) => void;
};

function getSupportedVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useVoiceRecorder({
  onActivityChange,
  onError,
}: UseVoiceRecorderOptions) {
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChatIdRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const elapsedMs =
    startedAt === null ? 0 : Math.max(0, tickMs - startedAt);

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  useEffect(() => {
    return () => {
      const currentRecorder = recorderRef.current;

      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }

      if (currentRecorder?.state === "recording") {
        currentRecorder.stop();
      }

      currentRecorder?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startRecording = async (chatId: number) => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("Voice recording is not supported in this browser.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedVoiceMimeType();
      const nextRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const nextStartedAt = Date.now();

      chunksRef.current = [];
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      nextRecorder.onerror = () => {
        onError("Voice recording failed.");
      };
      nextRecorder.start();

      setStartedAt(nextStartedAt);
      setTickMs(nextStartedAt);
      recorderRef.current = nextRecorder;
      recordingChatIdRef.current = chatId;
      setRecorder(nextRecorder);

      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      timerRef.current = window.setInterval(() => {
        setTickMs(Date.now());
      }, 250);

      onActivityChange(chatId, true);
      return true;
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied."
          : "Unable to start voice recording.";
      onError(message);
      return false;
    }
  };

  const stopRecording = async (
    shouldReturnBlob: boolean,
  ): Promise<VoiceRecordingResult | null> => {
    const currentRecorder = recorderRef.current;

    if (!currentRecorder) {
      return null;
    }

    const chatId = recordingChatIdRef.current;
    const durationMs = startedAt ? Date.now() - startedAt : 0;

    setRecorder(null);
    recorderRef.current = null;
    recordingChatIdRef.current = null;
    setStartedAt(null);
    setTickMs(0);

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    onActivityChange(chatId, false);

    const blob = await new Promise<Blob>((resolve) => {
      currentRecorder.onstop = () => {
        currentRecorder.stream.getTracks().forEach((track) => track.stop());
        resolve(
          new Blob(chunksRef.current, {
            type:
              currentRecorder.mimeType ||
              chunksRef.current[0]?.type ||
              "audio/webm",
          }),
        );
      };

      if (currentRecorder.state === "recording") {
        currentRecorder.stop();
      } else {
        currentRecorder.stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob([], { type: currentRecorder.mimeType || "audio/webm" }));
      }
    });

    chunksRef.current = [];

    if (!shouldReturnBlob) {
      return null;
    }

    return { blob, durationMs, chatId };
  };

  return {
    recorder,
    elapsedMs,
    startRecording,
    stopRecording,
  };
}
