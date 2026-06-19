import type { Segment } from '@/db/schema';
import { SEGMENT_PLAYBACK_OFFSET_SEC } from '@/lib/constants';

/**
 * Convert a segment's startMs to the audio engine seek position,
 * applying the pre-roll offset and clamping to 0.
 */
export function segmentStartSec(segment: { startMs: number }): number {
  return Math.max(0, segment.startMs / 1000 - SEGMENT_PLAYBACK_OFFSET_SEC);
}

/**
 * Find which segment is active based on the current playback time.
 * Sorts by startMs defensively — the DB query orders by segmentIndex but
 * this guard makes the function safe against out-of-order input.
 * Uses a linear scan since segment counts are small (typically <100 per episode).
 *
 * Both bounds are shifted back by SEGMENT_PLAYBACK_OFFSET_SEC to match the
 * offset applied during playback, keeping windows non-overlapping.
 */
export function findActiveSegmentId(
  segments: readonly Segment[],
  currentTimeSec: number,
): number | null {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  for (const segment of sorted) {
    const adjustedStart = segmentStartSec(segment);
    const adjustedEnd = Math.max(0, segment.endMs / 1000 - SEGMENT_PLAYBACK_OFFSET_SEC);
    if (currentTimeSec >= adjustedStart && currentTimeSec < adjustedEnd) {
      return segment.id;
    }
  }
  return null;
}

/**
 * Format a millisecond value as m:ss (e.g. 3723000 → "62:03").
 */
export function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Strip <ruby> and <rt> tags from furigana HTML, returning plain text.
 * Used when furigana display is toggled off.
 */
export function stripFurigana(html: string): string {
  return html
    .replace(/<rt[^>]*>.*?<\/rt>/gi, '')
    .replace(/<\/?ruby[^>]*>/gi, '');
}
