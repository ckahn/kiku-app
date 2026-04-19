import { describe, it, expect } from 'vitest';
import { computeChunkScrollDelta } from '../player/scrollChunk';

describe('computeChunkScrollDelta', () => {
  it('returns null when the chunk fits inside the ceiling', () => {
    expect(computeChunkScrollDelta(100, 400, 640)).toBeNull();
  });

  it('returns the downward delta when the chunk extends below the ceiling', () => {
    expect(computeChunkScrollDelta(500, 900, 640)).toBe(260);
  });

  it('returns the negative delta when the chunk sits above the viewport', () => {
    expect(computeChunkScrollDelta(-200, 100, 640)).toBe(-200);
  });

  it('prefers the downward correction when the chunk is taller than the ceiling', () => {
    // Chunk extends above 0 AND below ceiling — downward wins so the segment
    // end (the active reading position) stays visible.
    expect(computeChunkScrollDelta(-50, 900, 640)).toBe(260);
  });
});
