import { generateText, generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type {
  ElevenLabsWord,
  TranscriptChunk,
  ChunkWithFurigana,
  DrilldownContent,
} from './types';
import chunksFixture from '../../../fixtures/chunks.json';
import furiganaFixture from '../../../fixtures/furigana.json';
import drilldownFixture from '../../../fixtures/drilldown.json';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const transcriptChunkSchema = z.object({
  text: z.string(),
  first_word_index: z.number(),
  last_word_index: z.number(),
});

/**
 * Split a raw transcript into study chunks using Claude.
 * Returns chunk boundaries as word-array indices.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function chunkTranscript(
  fullText: string,
  words: readonly ElevenLabsWord[]
): Promise<readonly TranscriptChunk[]> {
  if (process.env.USE_MOCKS === 'true') {
    return chunksFixture as TranscriptChunk[];
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = createAnthropic({ apiKey });
  const wordList = words.map((w, i) => `${i}: "${w.text}"`).join('\n');

  const prompt = `You are a Japanese language teacher preparing podcast transcripts for study.

Split the following Japanese transcript into study chunks. Each chunk should be:
- 1–3 sentences long (roughly 20–60 characters)
- A natural pause point (end of sentence, topic shift, breath group)
- Self-contained enough to be studied alone

Return a JSON array where each object has:
- "text": the exact concatenated text of those words
- "first_word_index": integer index of the first word in this chunk
- "last_word_index": integer index of the last word in this chunk

Rules:
- Every word must appear in exactly one chunk (no gaps, no overlaps)
- Indices are 0-based and refer to the word list below
- Return ONLY the JSON array, no markdown fences, no explanation

Full transcript:
${fullText}

Word list (index: "text"):
${wordList}`;

  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    output: 'array',
    schema: transcriptChunkSchema,
    prompt,
  });

  return object;
}

/**
 * Annotate each chunk's text with <ruby> furigana tags using Claude.
 * Kanji receive readings; hiragana, katakana, and punctuation pass through unchanged.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function addFurigana(
  chunks: readonly TranscriptChunk[]
): Promise<readonly ChunkWithFurigana[]> {
  if (process.env.USE_MOCKS === 'true') {
    return furiganaFixture as ChunkWithFurigana[];
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = createAnthropic({ apiKey });
  const results: ChunkWithFurigana[] = [];

  for (const chunk of chunks) {
    const prompt = `Annotate the following Japanese text with <ruby> HTML tags for furigana.
Rules:
- Wrap each kanji compound in: <ruby>KANJI<rt>READING</rt></ruby>
- Hiragana, katakana, punctuation pass through unchanged
- Do not add spaces not present in the original
- Return ONLY the annotated HTML string, nothing else

Text: ${chunk.text}`;

    const { text } = await generateText({ model: anthropic(CLAUDE_MODEL), prompt, temperature: 0 });
    results.push({
      text: chunk.text,
      text_furigana: text.trim(),
      first_word_index: chunk.first_word_index,
      last_word_index: chunk.last_word_index,
    });
  }

  return results;
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
