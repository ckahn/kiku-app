const DEFAULT_FALLBACK_CLEARANCE_PX = 160;
const STICKY_PLAYER_GAP_PX = 16;
const STICKY_HEADER_GAP_PX = 16;

// Scrolls so the chunk's top sits just below the sticky header — used on
// navigation restore (e.g. returning from a segment's study page) where we want
// the chunk anchored at the top of the readable area, not just "in view".
export function scrollChunkToTop(chunkId: number): void {
  requestAnimationFrame(() => {
    const chunkEl = document.querySelector<HTMLElement>(
      `[data-chunk-id="${chunkId}"]`,
    );
    if (!chunkEl) return;

    const headerEl = document.querySelector<HTMLElement>('[data-sticky-header]');
    const floor = headerEl
      ? headerEl.getBoundingClientRect().bottom + STICKY_HEADER_GAP_PX
      : 0;

    const rect = chunkEl.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - floor, behavior: 'auto' });
  });
}

// Pure math: delta (in px) to scroll so the chunk sits between floor and ceiling.
// Returns null when the chunk is already comfortably visible.
// When the chunk is taller than the visible band, prefer the downward correction
// so the end of the segment (the active reading position) stays visible.
export function computeChunkScrollDelta(
  chunkTop: number,
  chunkBottom: number,
  floor: number,
  ceiling: number,
): number | null {
  if (chunkBottom > ceiling) {
    return chunkBottom - ceiling;
  }
  if (chunkTop < floor) {
    return chunkTop - floor;
  }
  return null;
}

export function scrollChunkIntoVisibleArea(chunkId: number): void {
  requestAnimationFrame(() => {
    const chunkEl = document.querySelector<HTMLElement>(
      `[data-chunk-id="${chunkId}"]`,
    );
    if (!chunkEl) return;

    const headerEl = document.querySelector<HTMLElement>('[data-sticky-header]');
    const floor = headerEl
      ? headerEl.getBoundingClientRect().bottom + STICKY_HEADER_GAP_PX
      : 0;

    const playerEl = document.querySelector<HTMLElement>('[data-sticky-player]');
    const ceiling = playerEl
      ? playerEl.getBoundingClientRect().top - STICKY_PLAYER_GAP_PX
      : window.innerHeight - DEFAULT_FALLBACK_CLEARANCE_PX;

    const rect = chunkEl.getBoundingClientRect();
    const delta = computeChunkScrollDelta(rect.top, rect.bottom, floor, ceiling);
    if (delta === null) return;

    window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
  });
}
