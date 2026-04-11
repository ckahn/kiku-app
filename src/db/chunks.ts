import { and, asc, eq } from 'drizzle-orm';
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
  // Pre-compute raw startMs for every chunk so we can extend each chunk's
  // endMs to fill the gap before the next chunk starts. ElevenLabs sometimes
  // compresses word timestamps at phrase boundaries, placing the last few
  // words inside the reported endSecond while the speech actually runs into
  // the inter-chunk gap. Filling the gap ensures no spoken audio is lost.
  const rawStartMs = chunksWithFurigana.map((chunk, index) => {
    const startWord = words[chunk.first_word_index];
    if (!startWord) {
      throw new Error(
        `Chunk ${index} has out-of-bounds first_word_index=${chunk.first_word_index}, ` +
        `words.length=${words.length}`
      );
    }
    return Math.round(startWord.startSecond * 1000);
  });

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
    const startMs = rawStartMs[index];
    const wordEndMs = Math.round(endWord.endSecond * 1000);
    const nextStartMs = rawStartMs[index + 1];
    // Extend endMs to fill any gap before the next chunk, so speech that
    // ElevenLabs places in the gap (due to timestamp compression) is included.
    const endMs = nextStartMs !== undefined && nextStartMs > wordEndMs
      ? nextStartMs
      : wordEndMs;
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

/**
 * Fetch a single chunk by id.
 */
export async function getChunkById(chunkId: number): Promise<Chunk | null> {
  const [chunk] = await db
    .select()
    .from(chunks)
    .where(eq(chunks.id, chunkId));

  return chunk ?? null;
}

/**
 * Fetch a single chunk by episode id and chunk index.
 */
export async function getChunkByEpisodeIdAndIndex(
  episodeId: number,
  chunkIndex: number
): Promise<Chunk | null> {
  const [chunk] = await db
    .select()
    .from(chunks)
    .where(and(
      eq(chunks.episodeId, episodeId),
      eq(chunks.chunkIndex, chunkIndex)
    ));

  return chunk ?? null;
}
