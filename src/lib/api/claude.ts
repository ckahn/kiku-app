import type {
  ElevenLabsWord,
  TranscriptChunk,
  ChunkWithFurigana,
  DrilldownContent,
} from './types';
import chunksFixture from '../../../fixtures/chunks.json';
import furiganaFixture from '../../../fixtures/furigana.json';
import drilldownFixture from '../../../fixtures/drilldown.json';

/**
 * Split a raw transcript into study chunks using Claude.
 * Returns chunk boundaries as word-array indices.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function chunkTranscript(
  _fullText: string,
  _words: readonly ElevenLabsWord[]
): Promise<readonly TranscriptChunk[]> {
  if (process.env.USE_MOCKS === 'true') {
    return chunksFixture as TranscriptChunk[];
  }
  throw new Error('Real Claude API not yet implemented — set USE_MOCKS=true');
}

/**
 * Annotate each chunk's text with <ruby> furigana tags using Claude.
 * Kanji receive readings; hiragana, katakana, and punctuation pass through unchanged.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function addFurigana(
  _chunks: readonly TranscriptChunk[]
): Promise<readonly ChunkWithFurigana[]> {
  if (process.env.USE_MOCKS === 'true') {
    return furiganaFixture as ChunkWithFurigana[];
  }
  throw new Error('Real Claude API not yet implemented — set USE_MOCKS=true');
}

/**
 * Generate a drill-down for a single chunk using Claude.
 * Returns per-sentence translations and grammar structure explanations.
 *
 * Set USE_MOCKS=true to return fixture data (same fixture for all chunks).
 */
export async function generateDrilldown(
  _chunkText: string
): Promise<DrilldownContent> {
  if (process.env.USE_MOCKS === 'true') {
    return drilldownFixture as DrilldownContent;
  }
  throw new Error('Real Claude API not yet implemented — set USE_MOCKS=true');
}
