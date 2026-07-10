import type { UIEvent } from "react";

const SCROLLBAR_ACTIVE_CLASS = "is-scrolling";
const SCROLLBAR_HIDE_DELAY_MS = 850;
const scrollbarTimers = new WeakMap<HTMLElement, number>();

export function keepSubtleScrollbarVisible(event: UIEvent<HTMLElement>) {
  const element = event.currentTarget;
  const existingTimer = scrollbarTimers.get(element);

  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }

  element.classList.add(SCROLLBAR_ACTIVE_CLASS);

  const nextTimer = window.setTimeout(() => {
    element.classList.remove(SCROLLBAR_ACTIVE_CLASS);
    scrollbarTimers.delete(element);
  }, SCROLLBAR_HIDE_DELAY_MS);

  scrollbarTimers.set(element, nextTimer);
}
