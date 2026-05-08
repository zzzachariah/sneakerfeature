export const KEY_SEQUENCE_WINDOW_MS = 900;
export const TAP_SEQUENCE_WINDOW_MS = 900;
export const EASTER_EGG_DISPLAY_MS = 1000;
export const EASTER_EGG_COOLDOWN_MS = 1200;
export const EASTER_EGG_OVERLAY_Z_INDEX = 300;

export type KeySequenceState = {
  count: number;
  lastAt: number;
};

function isPKey(key: string) {
  return key.toLowerCase() === "p";
}

export function advanceKeySequence(state: KeySequenceState, key: string, now: number): KeySequenceState {
  if (!isPKey(key)) {
    return {
      count: 0,
      lastAt: now
    };
  }

  if (state.count > 0 && now - state.lastAt <= KEY_SEQUENCE_WINDOW_MS) {
    return {
      count: state.count + 1,
      lastAt: now
    };
  }

  return {
    count: 1,
    lastAt: now
  };
}

export function appendTapTimestamp(queue: number[], now: number) {
  const next = queue.filter((timestamp) => now - timestamp <= TAP_SEQUENCE_WINDOW_MS);
  next.push(now);
  return next.slice(-3);
}

export function isExcludedTriggerTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, button, a, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"]'
    )
  );
}
