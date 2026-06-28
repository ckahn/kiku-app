// Pure, index-based range editing for the loop-gutter mock.
//
// The mock works in array-position space (0-based segment index) rather than
// segment ids to keep the experiment simple. When this interaction is ported to
// the real player, these helpers map onto loopRange.ts (firstSegmentId /
// lastSegmentId) — the shape of the operations is identical.

export type IndexRange = {
  readonly start: number; // inclusive, array position of first looped segment
  readonly end: number; // inclusive, array position of last looped segment
};

export type Endpoint = 'start' | 'end';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function makeAnchor(index: number): IndexRange {
  return { start: index, end: index };
}

export function rangeLength(range: IndexRange): number {
  return range.end - range.start + 1;
}

// Move one endpoint to a target index, keeping start <= end and staying within
// [0, count - 1]. Dragging an endpoint past its partner pins it to the partner
// (a length-1 range) rather than inverting.
export function setEndpoint(
  range: IndexRange,
  which: Endpoint,
  target: number,
  count: number,
): IndexRange {
  const clamped = clamp(target, 0, count - 1);
  if (which === 'start') {
    return { start: Math.min(clamped, range.end), end: range.end };
  }
  return { start: range.start, end: Math.max(clamped, range.start) };
}
