import type { Chunk } from '@/db/schema';
import { CHUNK_PLAYBACK_OFFSET_SEC } from '@/lib/constants';

/**
 * Find which chunk is active based on the current playback time.
 * Sorts by startMs defensively — the DB query orders by chunkIndex but
 * this guard makes the function safe against out-of-order input.
 * Uses a linear scan since chunk counts are small (typically <100 per episode).
 *
 * Both bounds are shifted back by CHUNK_PLAYBACK_OFFSET_SEC to match the
 * offset applied during playback, keeping windows non-overlapping.
 */
export function findActiveChunkId(
  chunks: readonly Chunk[],
  currentTimeSec: number,
): number | null {
  const sorted = [...chunks].sort((a, b) => a.startMs - b.startMs);
  for (const chunk of sorted) {
    const adjustedStart = Math.max(0, chunk.startMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC);
    const adjustedEnd = chunk.endMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC;
    if (currentTimeSec >= adjustedStart && currentTimeSec < adjustedEnd) {
      return chunk.id;
    }
  }
  return null;
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
