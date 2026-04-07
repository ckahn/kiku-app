import type { Chunk } from '@/db/schema';

/**
 * Find which chunk is active based on the current playback time.
 * Chunks are ordered by chunkIndex. Uses a linear scan since chunk
 * counts are small (typically <100 per episode).
 */
export function findActiveChunkId(
  chunks: readonly Chunk[],
  currentTimeSec: number,
): number | null {
  for (const chunk of chunks) {
    if (
      currentTimeSec >= chunk.startMs / 1000 &&
      currentTimeSec < chunk.endMs / 1000
    ) {
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
