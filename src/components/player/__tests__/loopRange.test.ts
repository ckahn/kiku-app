import { describe, it, expect } from 'vitest';
import { makeAnchor, validateRange } from '../loopRange';
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
