import { describe, it, expect } from 'vitest';
import { computeSegmentScrollDelta } from '../player/scrollSegment';

describe('computeSegmentScrollDelta', () => {
  it('returns null when the segment fits between the floor and ceiling', () => {
    expect(computeSegmentScrollDelta(100, 400, 60, 640)).toBeNull();
  });

  it('returns the downward delta when the segment extends below the ceiling', () => {
    expect(computeSegmentScrollDelta(500, 900, 60, 640)).toBe(260);
  });

  it('returns a negative delta when the segment sits above the floor', () => {
    // segmentTop=20, floor=60 → delta=-40 (scroll up 40px so top aligns with floor).
    expect(computeSegmentScrollDelta(20, 300, 60, 640)).toBe(-40);
  });

  it('returns the negative delta when the segment is above the viewport entirely', () => {
    expect(computeSegmentScrollDelta(-200, 100, 60, 640)).toBe(-260);
  });

  it('prefers the downward correction when the segment is taller than the visible band', () => {
    // Segment extends above the floor AND below the ceiling — downward wins so
    // the segment end (the active reading position) stays visible.
    expect(computeSegmentScrollDelta(-50, 900, 60, 640)).toBe(260);
  });
});
