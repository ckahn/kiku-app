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

// Returns the range if both endpoints exist and are contiguous; null otherwise.
// Used at runtime to discard a stale range after the segment list changes.
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
