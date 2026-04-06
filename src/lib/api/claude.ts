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
 * Returns kanji characters in `annotated` that are not wrapped in a <ruby> tag.
 * Used to detect when Claude missed annotating a character.
 */
export function findUnannotatedKanji(annotated: string): string[] {
  const stripped = annotated.replace(/<ruby>[\s\S]*?<\/ruby>/g, '');
  return [...stripped.matchAll(/[\u4e00-\u9fff]/g)].map((m) => m[0]);
}

function containsKana(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
}

/**
 * Unwraps ruby tags when the ruby base text contains kana.
 * Contract: stored furigana may use <ruby> only when the ruby base text is kanji-only.
 * Outputs like <ruby>テスト<rt>てすと</rt></ruby> or
 * <ruby>聞いて<rt>きいて</rt></ruby> are invalid and normalized back to plain text.
 */
export function unwrapRubyContainingKana(annotated: string): string {
  return annotated.replace(/<ruby>([\s\S]*?)<\/ruby>/g, (fullMatch, inner) => {
    const baseText = inner
      .replace(/<rt>[\s\S]*?<\/rt>/g, '')
      .replace(/<rp>[\s\S]*?<\/rp>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();

    return containsKana(baseText) ? baseText : fullMatch;
  });
}

const FURIGANA_PROMPT = `Annotate each Japanese text chunk with <ruby> HTML tags for furigana.

Rules:
- Every kanji character MUST be wrapped — do not skip any.
- For compound words read as a unit, wrap all kanji together:
  <ruby>日本語<rt>にほんご</rt></ruby>  <ruby>勉強<rt>べんきょう</rt></ruby>
- For a single kanji (especially with okurigana), wrap only the kanji:
  <ruby>聞<rt>き</rt></ruby>いて  <ruby>食<rt>た</rt></ruby>べる
- A <ruby> tag is valid only when its base text is kanji-only.
- Hiragana, katakana, punctuation, and okurigana pass through unchanged.
- Wrong: <ruby>テスト<rt>てすと</rt></ruby>
- Wrong: <ruby>ありがとう<rt>ありがとう</rt></ruby>
- Wrong: <ruby>聞いて<rt>きいて</rt></ruby>
- Correct: <ruby>聞<rt>き</rt></ruby>いて
- Do not add spaces not present in the original.

Chunks:
`;

/**
 * Annotate each chunk's text with <ruby> furigana tags using Claude.
 * Stored contract:
 * - <ruby> may wrap kanji-only base text
 * - hiragana, katakana, punctuation, and okurigana must remain plain text
 * Invalid ruby around kana is normalized away before persistence.
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

  const { object } = await generateObject({
    model: anthropic(CLAUDE_FURIGANA_MODEL),
    schema: furiganaResultSchema,
    prompt: FURIGANA_PROMPT + chunkList,
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
      return {
        text: chunk.text,
        text_furigana: sanitizeHtml(chunk.text, { allowedTags: [], allowedAttributes: {} }),
        first_word_index: chunk.first_word_index,
        last_word_index: chunk.last_word_index,
      };
    }

    const normalizedFurigana = unwrapRubyContainingKana(furigana);
    const missed = findUnannotatedKanji(normalizedFurigana);
    if (missed.length > 0) {
      console.error(`[addFurigana] chunk ${i} missing furigana for: ${missed.join('')}`);
    }

    return {
      text: chunk.text,
      text_furigana: sanitizeHtml(normalizedFurigana, {
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
