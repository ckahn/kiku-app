const DEFAULT_FALLBACK_CLEARANCE_PX = 160;
const STICKY_PLAYER_GAP_PX = 16;
const STICKY_HEADER_GAP_PX = 16;

// Scrolls so the segment's top sits just below the sticky header — used on
// navigation restore (e.g. returning from a segment's study page) where we want
// the segment anchored at the top of the readable area, not just "in view".
export function scrollSegmentToTop(segmentId: number): void {
  requestAnimationFrame(() => {
    const segmentEl = document.querySelector<HTMLElement>(
      `[data-segment-id="${segmentId}"]`,
    );
    if (!segmentEl) return;

    const headerEl = document.querySelector<HTMLElement>('[data-sticky-header]');
    const floor = headerEl
      ? headerEl.getBoundingClientRect().bottom + STICKY_HEADER_GAP_PX
      : 0;

    const rect = segmentEl.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - floor, behavior: 'auto' });
  });
}

// Pure math: delta (in px) to scroll so the segment sits between floor and ceiling.
// Returns null when the segment is already comfortably visible.
// When the segment is taller than the visible band, prefer the downward correction
// so the end of the segment (the active reading position) stays visible.
export function computeSegmentScrollDelta(
  segmentTop: number,
  segmentBottom: number,
  floor: number,
  ceiling: number,
): number | null {
  if (segmentBottom > ceiling) {
    return segmentBottom - ceiling;
  }
  if (segmentTop < floor) {
    return segmentTop - floor;
  }
  return null;
}

export function scrollSegmentIntoVisibleArea(segmentId: number): void {
  requestAnimationFrame(() => {
    const segmentEl = document.querySelector<HTMLElement>(
      `[data-segment-id="${segmentId}"]`,
    );
    if (!segmentEl) return;

    const headerEl = document.querySelector<HTMLElement>('[data-sticky-header]');
    const floor = headerEl
      ? headerEl.getBoundingClientRect().bottom + STICKY_HEADER_GAP_PX
      : 0;

    const playerEl = document.querySelector<HTMLElement>('[data-sticky-player]');
    const ceiling = playerEl
      ? playerEl.getBoundingClientRect().top - STICKY_PLAYER_GAP_PX
      : window.innerHeight - DEFAULT_FALLBACK_CLEARANCE_PX;

    const rect = segmentEl.getBoundingClientRect();
    const delta = computeSegmentScrollDelta(rect.top, rect.bottom, floor, ceiling);
    if (delta === null) return;

    window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
  });
}
