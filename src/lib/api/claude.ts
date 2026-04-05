import { generateObject } from 'ai';
import sanitizeHtml from 'sanitize-html';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_CHUNK_MODEL, CLAUDE_FURIGANA_MODEL } from '@/lib/constants';
import type {
  ElevenLabsWord,
  TranscriptChunk,
  ChunkWithFurigana,
  DrilldownContent,
} from './types';
import chunksFixture from '../../../fixtures/chunks.json';
import furiganaFixture from '../../../fixtures/furigana.json';
import drilldownFixture from '../../../fixtures/drilldown.json';

const transcriptChunkSchema = z.object({
  text: z.string(),
  first_word_index: z.number(),
  last_word_index: z.number(),
});

const chunkedTranscriptSchema = z.object({
  chunks: z.array(transcriptChunkSchema),
});

const furiganaResultSchema = z.object({
  annotated_chunks: z.array(z.object({
    index: z.number(),
    text_furigana: z.string(),
  })),
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

Split the following Japanese transcript into study chunks. Each chunk should be a coherent paragraph — a complete thought or exchange that can be studied on its own.

Guidelines:
- GROUP related sentences together — a chunk is a thematic unit, not a single sentence
- SPLIT only when the topic or speaker's intent clearly shifts
- Typically 2–4 sentences per chunk; a single sentence is fine only if it is long (40+ chars) or stands alone topically
- Short filler utterances (はい、ええ、うん、そうですね) must merge with the adjacent sentence

Example — given: こんにちは！ポッドキャストを聞いてくれてありがとうございます。今日は元気ですか？これは日本語を勉強している初心者のためのポッドキャストです。役に立てばうれしいです！
Correct chunks:
  chunk 1: こんにちは！ポッドキャストを聞いてくれてありがとうございます。今日は元気ですか？
  chunk 2: これは日本語を勉強している初心者のためのポッドキャストです。役に立てばうれしいです！
Wrong: splitting each sentence into its own chunk.

Each chunk object must have:
- "text": the exact concatenated text of those words (spaces between words if present)
- "first_word_index": integer index of the first word in this chunk
- "last_word_index": integer index of the last word in this chunk

Rules:
- Every word must appear in exactly one chunk (no gaps, no overlaps)
- Indices are 0-based and refer to the word list below

Word list (index: "text"):
${wordList}`;

  const { object } = await generateObject({
    model: anthropic(CLAUDE_CHUNK_MODEL),
    schema: chunkedTranscriptSchema,
    prompt,
  });

  return object.chunks;
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
  const chunkList = chunks.map((c, i) => `[${i}] ${c.text}`).join('\n');

  const prompt = `Annotate each Japanese text chunk with <ruby> HTML tags for furigana.
Rules:
- Wrap each kanji or kanji compound in: <ruby>KANJI<rt>READING</rt></ruby>
- Hiragana, katakana, punctuation pass through unchanged
- Do not add spaces not present in the original

Chunks:
${chunkList}`;

  const { object } = await generateObject({
    model: anthropic(CLAUDE_FURIGANA_MODEL),
    schema: furiganaResultSchema,
    prompt,
    temperature: 0,
  });

  // Map by .index field, not array position — Claude may return results out of order
  // or return fewer items than requested. Fall back to raw text (no ruby) if missing.
  const furiganaByIndex = new Map(
    object.annotated_chunks.map((ac) => [ac.index, ac.text_furigana])
  );

  return chunks.map((chunk, i) => {
    const furigana = furiganaByIndex.get(i);
    if (furigana === undefined) {
      console.error(`[addFurigana] no annotation returned for chunk index ${i} — falling back to raw text`);
    }
    return {
      text: chunk.text,
      text_furigana: sanitizeHtml(furigana ?? chunk.text, {
        allowedTags: ['ruby', 'rt', 'rp'],
        allowedAttributes: {},
      }),
      first_word_index: chunk.first_word_index,
      last_word_index: chunk.last_word_index,
    };
  });
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
