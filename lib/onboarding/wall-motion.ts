/** Fisher–Yates: keep the source catalogue intact and each shoe unique. */
export function shuffleWallItems<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Scrub the existing infinite animation; wrapping preserves its repeated image. */
export function shiftWallTimeline(current: number, deltaX: number, cycleWidth: number, duration: number) {
  if (![current, deltaX, cycleWidth, duration].every(Number.isFinite) || cycleWidth <= 0 || duration <= 0) return current;
  const next = current - deltaX / cycleWidth * duration;
  return ((next % duration) + duration) % duration;
}
