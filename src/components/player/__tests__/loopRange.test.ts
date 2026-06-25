import { describe, it, expect } from 'vitest';
import {
  makeAnchor,
  rangeLength,
  isInRange,
  canGrowUp,
  canGrowDown,
  canShrink,
  growUp,
  growDown,
  shrinkUp,
  shrinkDown,
  validateRange,
} from '../loopRange';
import type { LoopRange } from '../loopRange';
import type { Segment } from '@/db/schema';

// Minimal segment factory — only fields loopRange.ts touches.
function seg(id: number, segmentIndex: number): Segment {
  return {
    id,
    segmentIndex,
    episodeId: 1,
    textRaw: '',
    textFurigana: '',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs: segmentIndex * 10000,
    endMs: segmentIndex * 10000 + 9000,
    sentences: [],
    studyStatus: 'new',
    learnedAt: null,
    nextReview: null,
    createdAt: null,
  } as unknown as Segment;
}

// Three-segment list: A(id=1,idx=0), B(id=2,idx=1), C(id=3,idx=2)
const A = seg(1, 0);
const B = seg(2, 1);
const C = seg(3, 2);
const segs = [A, B, C];

describe('makeAnchor', () => {
  it('creates a length-1 range', () => {
    const r = makeAnchor(2);
    expect(r).toEqual<LoopRange>({ firstSegmentId: 2, lastSegmentId: 2 });
  });
});

describe('rangeLength', () => {
  it('returns 1 for a single-segment range', () => {
    expect(rangeLength(segs, makeAnchor(A.id))).toBe(1);
  });

  it('returns 3 for a full-list range', () => {
    expect(rangeLength(segs, { firstSegmentId: A.id, lastSegmentId: C.id })).toBe(3);
  });

  it('returns 0 when an endpoint id is missing', () => {
    expect(rangeLength(segs, { firstSegmentId: 99, lastSegmentId: C.id })).toBe(0);
  });
});

describe('isInRange', () => {
  const range: LoopRange = { firstSegmentId: A.id, lastSegmentId: B.id };

  it('returns true for segments inside the band', () => {
    expect(isInRange(segs, range, A.id)).toBe(true);
    expect(isInRange(segs, range, B.id)).toBe(true);
  });

  it('returns false for a segment outside the band', () => {
    expect(isInRange(segs, range, C.id)).toBe(false);
  });

  it('returns false for an unknown id', () => {
    expect(isInRange(segs, range, 99)).toBe(false);
  });
});

describe('canGrowUp / canGrowDown', () => {
  it('cannot grow up when first is already at top of list', () => {
    expect(canGrowUp(segs, { firstSegmentId: A.id, lastSegmentId: B.id })).toBe(false);
  });

  it('can grow up when there is a segment before first', () => {
    expect(canGrowUp(segs, { firstSegmentId: B.id, lastSegmentId: C.id })).toBe(true);
  });

  it('cannot grow down when last is already at end of list', () => {
    expect(canGrowDown(segs, { firstSegmentId: B.id, lastSegmentId: C.id })).toBe(false);
  });

  it('can grow down when there is a segment after last', () => {
    expect(canGrowDown(segs, { firstSegmentId: A.id, lastSegmentId: B.id })).toBe(true);
  });
});

describe('canShrink', () => {
  it('returns false for a length-1 range', () => {
    expect(canShrink(segs, makeAnchor(B.id))).toBe(false);
  });

  it('returns true for a length-2+ range', () => {
    expect(canShrink(segs, { firstSegmentId: A.id, lastSegmentId: B.id })).toBe(true);
  });
});

describe('growUp', () => {
  it('extends the first endpoint by one segment', () => {
    const r = growUp(segs, { firstSegmentId: B.id, lastSegmentId: C.id });
    expect(r).toEqual<LoopRange>({ firstSegmentId: A.id, lastSegmentId: C.id });
  });

  it('returns null when already at the top of the list', () => {
    expect(growUp(segs, { firstSegmentId: A.id, lastSegmentId: B.id })).toBeNull();
  });
});

describe('growDown', () => {
  it('extends the last endpoint by one segment', () => {
    const r = growDown(segs, { firstSegmentId: A.id, lastSegmentId: B.id });
    expect(r).toEqual<LoopRange>({ firstSegmentId: A.id, lastSegmentId: C.id });
  });

  it('returns null when already at the end of the list', () => {
    expect(growDown(segs, { firstSegmentId: A.id, lastSegmentId: C.id })).toBeNull();
  });
});

describe('shrinkUp', () => {
  it('removes the first segment from a 3-segment range', () => {
    const r = shrinkUp(segs, { firstSegmentId: A.id, lastSegmentId: C.id });
    expect(r).toEqual<LoopRange>({ firstSegmentId: B.id, lastSegmentId: C.id });
  });

  it('returns null (no-op) for a length-1 range', () => {
    expect(shrinkUp(segs, makeAnchor(B.id))).toBeNull();
  });
});

describe('shrinkDown', () => {
  it('removes the last segment from a 3-segment range', () => {
    const r = shrinkDown(segs, { firstSegmentId: A.id, lastSegmentId: C.id });
    expect(r).toEqual<LoopRange>({ firstSegmentId: A.id, lastSegmentId: B.id });
  });

  it('returns null (no-op) for a length-1 range', () => {
    expect(shrinkDown(segs, makeAnchor(B.id))).toBeNull();
  });
});

describe('validateRange', () => {
  it('returns the range when both endpoints exist and are contiguous', () => {
    const r: LoopRange = { firstSegmentId: A.id, lastSegmentId: C.id };
    expect(validateRange(segs, r)).toEqual(r);
  });

  it('returns the range for a length-1 range', () => {
    const r = makeAnchor(B.id);
    expect(validateRange(segs, r)).toEqual(r);
  });

  it('returns null when firstSegmentId is missing from segments', () => {
    expect(validateRange(segs, { firstSegmentId: 99, lastSegmentId: C.id })).toBeNull();
  });

  it('returns null when lastSegmentId is missing from segments', () => {
    expect(validateRange(segs, { firstSegmentId: A.id, lastSegmentId: 99 })).toBeNull();
  });

  it('returns null when endpoints are non-contiguous', () => {
    // D has segmentIndex 10, so A→D has a gap
    const D = seg(4, 10);
    expect(validateRange([A, B, C, D], { firstSegmentId: A.id, lastSegmentId: D.id })).toBeNull();
  });

  it('returns null when first comes after last in segment order', () => {
    expect(validateRange(segs, { firstSegmentId: C.id, lastSegmentId: A.id })).toBeNull();
  });
});
