import { eq, asc } from 'drizzle-orm';
import { db } from '.';
import { chunks } from './schema';
import type { Chunk } from './schema';
import type { ChunkWithFurigana, ElevenLabsWord } from '@/lib/api/types';

/**
 * Bulk-insert chunks for an episode.
 * Derives start_ms and end_ms from the word-level timestamp array.
 */
export async function insertChunks(
  episodeId: number,
  chunksWithFurigana: readonly ChunkWithFurigana[],
  words: readonly ElevenLabsWord[]
): Promise<void> {
  const values = chunksWithFurigana.map((chunk, index) => {
    const startWord = words[chunk.first_word_index];
    const endWord = words[chunk.last_word_index];
    if (!startWord || !endWord) {
      throw new Error(
        `Chunk ${index} has out-of-bounds word indices: ` +
        `first=${chunk.first_word_index}, last=${chunk.last_word_index}, ` +
        `words.length=${words.length}`
      );
    }
    const startMs = Math.round(startWord.startSecond * 1000);
    const endMs = Math.round(endWord.endSecond * 1000);
    return {
      episodeId,
      chunkIndex: index,
      textRaw: chunk.text,
      textFurigana: chunk.text_furigana,
      furiganaStatus: chunk.furigana_status,
      furiganaWarning: chunk.furigana_warning,
      startMs,
      endMs,
      sentences: [{ text: chunk.text, start_ms: startMs, end_ms: endMs }] as unknown as Record<string, unknown>[],
    };
  });
  await db.insert(chunks).values(values);
}

/**
 * Fetch all chunks for an episode in order.
 */
export async function getChunksByEpisodeId(episodeId: number): Promise<Chunk[]> {
  return db
    .select()
    .from(chunks)
    .where(eq(chunks.episodeId, episodeId))
    .orderBy(asc(chunks.chunkIndex));
}
