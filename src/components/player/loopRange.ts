import type { Segment } from '@/db/schema';

export type LoopRange = {
  readonly firstSegmentId: number;
  readonly lastSegmentId: number;
};

function sorted(segments: readonly Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.segmentIndex - b.segmentIndex);
}

function idxOf(segs: Segment[], segmentId: number): number {
  return segs.findIndex((s) => s.id === segmentId);
}

export function makeAnchor(segmentId: number): LoopRange {
  return { firstSegmentId: segmentId, lastSegmentId: segmentId };
}

export function rangeLength(segments: readonly Segment[], range: LoopRange): number {
  const segs = sorted(segments);
  const fi = idxOf(segs, range.firstSegmentId);
  const li = idxOf(segs, range.lastSegmentId);
  if (fi === -1 || li === -1) return 0;
  return li - fi + 1;
}

export function isInRange(
  segments: readonly Segment[],
  range: LoopRange,
  segmentId: number,
): boolean {
  const segs = sorted(segments);
  const fi = idxOf(segs, range.firstSegmentId);
  const li = idxOf(segs, range.lastSegmentId);
  const idx = idxOf(segs, segmentId);
  if (fi === -1 || li === -1 || idx === -1) return false;
  return idx >= fi && idx <= li;
}

export function canGrowUp(segments: readonly Segment[], range: LoopRange): boolean {
  const segs = sorted(segments);
  const fi = idxOf(segs, range.firstSegmentId);
  return fi > 0;
}

export function canGrowDown(segments: readonly Segment[], range: LoopRange): boolean {
  const segs = sorted(segments);
  const li = idxOf(segs, range.lastSegmentId);
  return li !== -1 && li < segs.length - 1;
}

export function canShrink(segments: readonly Segment[], range: LoopRange): boolean {
  return rangeLength(segments, range) > 1;
}

export function growUp(segments: readonly Segment[], range: LoopRange): LoopRange | null {
  if (!canGrowUp(segments, range)) return null;
  const segs = sorted(segments);
  const fi = idxOf(segs, range.firstSegmentId);
  return { ...range, firstSegmentId: segs[fi - 1].id };
}

export function growDown(segments: readonly Segment[], range: LoopRange): LoopRange | null {
  if (!canGrowDown(segments, range)) return null;
  const segs = sorted(segments);
  const li = idxOf(segs, range.lastSegmentId);
  return { ...range, lastSegmentId: segs[li + 1].id };
}

export function shrinkUp(segments: readonly Segment[], range: LoopRange): LoopRange | null {
  if (!canShrink(segments, range)) return null;
  const segs = sorted(segments);
  const fi = idxOf(segs, range.firstSegmentId);
  return { ...range, firstSegmentId: segs[fi + 1].id };
}

export function shrinkDown(segments: readonly Segment[], range: LoopRange): LoopRange | null {
  if (!canShrink(segments, range)) return null;
  const segs = sorted(segments);
  const li = idxOf(segs, range.lastSegmentId);
  return { ...range, lastSegmentId: segs[li - 1].id };
}

// Returns the range if both endpoints exist and are contiguous; null otherwise.
// Used at runtime and by the persistence loader to discard stale ranges.
export function validateRange(
  segments: readonly Segment[],
  range: LoopRange,
): LoopRange | null {
  const segs = sorted(segments);
  const fi = idxOf(segs, range.firstSegmentId);
  const li = idxOf(segs, range.lastSegmentId);
  if (fi === -1 || li === -1 || fi > li) return null;
  for (let i = fi; i < li; i++) {
    if (segs[i + 1].segmentIndex !== segs[i].segmentIndex + 1) return null;
  }
  return range;
}
