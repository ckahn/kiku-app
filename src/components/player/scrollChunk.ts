const DEFAULT_FALLBACK_CLEARANCE_PX = 160;
const STICKY_PLAYER_GAP_PX = 16;

export function scrollChunkIntoView(
  chunkId: number,
  options: ScrollIntoViewOptions,
): void {
  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(
      `[data-chunk-id="${chunkId}"]`,
    );
    element?.scrollIntoView(options);
  });
}

// Pure math: delta (in px) to scroll so the chunk fits above the ceiling.
// Returns null when the chunk is already comfortably visible.
export function computeChunkScrollDelta(
  chunkTop: number,
  chunkBottom: number,
  ceiling: number,
): number | null {
  if (chunkBottom > ceiling) {
    return chunkBottom - ceiling;
  }
  if (chunkTop < 0) {
    return chunkTop;
  }
  return null;
}

export function scrollChunkAboveStickyPlayer(chunkId: number): void {
  requestAnimationFrame(() => {
    const chunkEl = document.querySelector<HTMLElement>(
      `[data-chunk-id="${chunkId}"]`,
    );
    if (!chunkEl) return;

    const playerEl = document.querySelector<HTMLElement>('[data-sticky-player]');
    const ceiling = playerEl
      ? playerEl.getBoundingClientRect().top - STICKY_PLAYER_GAP_PX
      : window.innerHeight - DEFAULT_FALLBACK_CLEARANCE_PX;

    const rect = chunkEl.getBoundingClientRect();
    const delta = computeChunkScrollDelta(rect.top, rect.bottom, ceiling);
    if (delta === null) return;

    window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
  });
}
