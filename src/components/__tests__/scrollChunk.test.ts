import { describe, it, expect } from 'vitest';
import { computeChunkScrollDelta } from '../player/scrollChunk';

describe('computeChunkScrollDelta', () => {
  it('returns null when the chunk fits between the floor and ceiling', () => {
    expect(computeChunkScrollDelta(100, 400, 60, 640)).toBeNull();
  });

  it('returns the downward delta when the chunk extends below the ceiling', () => {
    expect(computeChunkScrollDelta(500, 900, 60, 640)).toBe(260);
  });

  it('returns a negative delta when the chunk sits above the floor', () => {
    // chunkTop=20, floor=60 → delta=-40 (scroll up 40px so top aligns with floor).
    expect(computeChunkScrollDelta(20, 300, 60, 640)).toBe(-40);
  });

  it('returns the negative delta when the chunk is above the viewport entirely', () => {
    expect(computeChunkScrollDelta(-200, 100, 60, 640)).toBe(-260);
  });

  it('prefers the downward correction when the chunk is taller than the visible band', () => {
    // Chunk extends above the floor AND below the ceiling — downward wins so
    // the segment end (the active reading position) stays visible.
    expect(computeChunkScrollDelta(-50, 900, 60, 640)).toBe(260);
  });
});
