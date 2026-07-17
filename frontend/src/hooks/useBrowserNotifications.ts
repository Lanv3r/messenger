import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { getChatMessagePreviewText } from "@/lib/chat-helpers";
import { getAssetUrl } from "@/lib/message-helpers";
import type { Chat, ChatMessage } from "@/types";

const NOTIFICATION_PREFERENCE_PREFIX = "messenger-browser-notifications";
const MAX_REMEMBERED_MESSAGES = 500;
const NOTIFICATION_TONE_DURATION_SECONDS = 0.24;
const TITLE_NEW_MESSAGE_DURATION_MS = 1000;

type BrowserNotificationPermission = NotificationPermission | "unsupported";

type UseBrowserNotificationsOptions = {
  userId: number;
  chats: Chat[];
  activeChatIdRef: MutableRefObject<number | null>;
};

function getNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

function getNotificationPreferenceKey(userId: number) {
  return `${NOTIFICATION_PREFERENCE_PREFIX}:${userId}`;
}

function getStoredNotificationPreference(userId: number) {
  try {
    return window.localStorage.getItem(getNotificationPreferenceKey(userId)) !== "off";
  } catch {
    return true;
  }
}

function storeNotificationPreference(userId: number, enabled: boolean) {
  try {
    window.localStorage.setItem(
      getNotificationPreferenceKey(userId),
      enabled ? "on" : "off",
    );
  } catch {
    // Notifications can still work when storage is unavailable.
  }
}

export function useBrowserNotifications({
  userId,
  chats,
  activeChatIdRef,
}: UseBrowserNotificationsOptions) {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(
    getNotificationPermission,
  );
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined" ? true : getStoredNotificationPreference(userId),
  );
  const notifiedMessageKeysRef = useRef(new Set<string>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const originalTitleRef = useRef("");
  const titleNoticeTimerRef = useRef<number | null>(null);
  const titleNotificationCountRef = useRef(0);
  const unreadMessageCount = chats.reduce(
    (count, chat) => count + chat.unread_count,
    0,
  );
  const unreadMessageCountRef = useRef(unreadMessageCount);

  function getAudioContext() {
    if (typeof window === "undefined" || !("AudioContext" in window)) {
      return null;
    }

    if (audioContextRef.current === null) {
      audioContextRef.current = new window.AudioContext();
    }

    return audioContextRef.current;
  }

  function primeNotificationTone() {
    const audioContext = getAudioContext();
    if (audioContext?.state === "suspended") {
      void audioContext.resume();
    }
  }

  function playNotificationTone() {
    const audioContext = getAudioContext();
    if (!audioContext) {
      return;
    }

    if (audioContext.state !== "running") {
      void audioContext.resume();
      return;
    }

    const startedAt = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.1, startedAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startedAt + NOTIFICATION_TONE_DURATION_SECONDS,
    );
    gain.connect(audioContext.destination);

    for (const [offset, frequency] of [
      [0, 880],
      [0.12, 1175],
    ]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startedAt + offset);
      oscillator.connect(gain);
      oscillator.start(startedAt + offset);
      oscillator.stop(startedAt + offset + 0.095);
    }
  }

  function getNotificationTitle() {
    const count = titleNotificationCountRef.current;
    return `(${count}) ${originalTitleRef.current}`;
  }

  function flashDocumentTitle() {
    titleNotificationCountRef.current += 1;
    if (titleNoticeTimerRef.current !== null) {
      window.clearTimeout(titleNoticeTimerRef.current);
    }

    document.title = "New message";
    titleNoticeTimerRef.current = window.setTimeout(() => {
      titleNoticeTimerRef.current = null;
      if (unreadMessageCountRef.current === 0) {
        resetNotificationTitle();
        return;
      }

      titleNotificationCountRef.current = unreadMessageCountRef.current;
      document.title = getNotificationTitle();
    }, TITLE_NEW_MESSAGE_DURATION_MS);
  }

  function resetNotificationTitle() {
    if (titleNoticeTimerRef.current !== null) {
      window.clearTimeout(titleNoticeTimerRef.current);
      titleNoticeTimerRef.current = null;
    }

    titleNotificationCountRef.current = 0;
    document.title = originalTitleRef.current;
  }

  useEffect(() => {
    setPermission(getNotificationPermission());
    setEnabled(getStoredNotificationPreference(userId));
    notifiedMessageKeysRef.current.clear();
  }, [userId]);

  useEffect(() => {
    originalTitleRef.current = document.title;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        resetNotificationTitle();
      }
    }

    window.addEventListener("focus", resetNotificationTitle);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", resetNotificationTitle);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resetNotificationTitle();
    };
  }, []);

  useEffect(() => {
    unreadMessageCountRef.current = unreadMessageCount;

    if (titleNotificationCountRef.current === 0) {
      return;
    }

    if (unreadMessageCount === 0) {
      if (titleNoticeTimerRef.current === null) {
        resetNotificationTitle();
      }
      return;
    }

    titleNotificationCountRef.current = unreadMessageCount;
    if (
      titleNoticeTimerRef.current === null &&
      (document.visibilityState !== "visible" || !document.hasFocus())
    ) {
      document.title = getNotificationTitle();
    }
  }, [unreadMessageCount]);

  useEffect(() => {
    if (permission !== "granted" || !enabled) {
      return undefined;
    }

    function primeFromUserInteraction() {
      primeNotificationTone();
      document.removeEventListener("pointerdown", primeFromUserInteraction);
      document.removeEventListener("keydown", primeFromUserInteraction);
    }

    document.addEventListener("pointerdown", primeFromUserInteraction);
    document.addEventListener("keydown", primeFromUserInteraction);

    return () => {
      document.removeEventListener("pointerdown", primeFromUserInteraction);
      document.removeEventListener("keydown", primeFromUserInteraction);
    };
  }, [enabled, permission]);

  const requestNotifications = async () => {
    primeNotificationTone();
    const currentPermission = getNotificationPermission();
    setPermission(currentPermission);

    if (currentPermission === "unsupported" || currentPermission === "denied") {
      return;
    }

    if (currentPermission === "granted") {
      setEnabled((current) => {
        const next = !current;
        storeNotificationPreference(userId, next);
        return next;
      });
      return;
    }

    const nextPermission = await window.Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission === "granted") {
      setEnabled(true);
      storeNotificationPreference(userId, true);
    }
  };

  const notifyIncomingMessage = useEffectEvent((message: ChatMessage) => {
    if (
      message.sender_id === userId ||
      permission !== "granted" ||
      !enabled ||
      typeof window === "undefined"
    ) {
      return;
    }

    const messageKey = `${message.chat_id}:${message.id}`;
    if (notifiedMessageKeysRef.current.has(messageKey)) {
      return;
    }

    notifiedMessageKeysRef.current.add(messageKey);
    if (notifiedMessageKeysRef.current.size > MAX_REMEMBERED_MESSAGES) {
      const oldestMessageKey = notifiedMessageKeysRef.current.values().next().value;
      if (oldestMessageKey) {
        notifiedMessageKeysRef.current.delete(oldestMessageKey);
      }
    }

    const isReadingThisChat =
      activeChatIdRef.current === message.chat_id &&
      document.visibilityState === "visible" &&
      document.hasFocus();
    if (isReadingThisChat) {
      playNotificationTone();
      return;
    }

    const chat = chats.find((entry) => entry.id === message.chat_id);
    const title = chat?.display_title || message.sender_username || "New message";
    const body = getChatMessagePreviewText(message) ?? "New message";
    const icon = getAssetUrl(
      chat?.display_avatar_url || message.sender_avatar_url || "/favicon.svg",
    );
    const notification = new window.Notification(title, {
      body,
      icon,
      tag: `messenger-chat-${message.chat_id}`,
    });
    playNotificationTone();

    if (document.visibilityState !== "visible" || !document.hasFocus()) {
      flashDocumentTitle();
    }

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  });

  return {
    permission,
    isEnabled: permission === "granted" && enabled,
    requestNotifications,
    notifyIncomingMessage,
  };
}
