import { generateObject } from 'ai';
import sanitizeHtml from 'sanitize-html';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_CHUNK_MODEL, CLAUDE_FURIGANA_MODEL } from '@/lib/constants';
import type {
  ChunkWithFurigana,
  DrilldownContent,
  ElevenLabsWord,
  FuriganaSpan,
  TranscriptChunk,
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

const furiganaSpanSchema = z.object({
  surface: z.string(),
  reading: z.union([z.string(), z.null()]),
});

const furiganaResultSchema = z.object({
  annotated_chunks: z.array(z.object({
    index: z.number(),
    spans: z.array(furiganaSpanSchema),
  })),
});

const KANJI_RE = /[\u4e00-\u9fff]/;
const ONLY_KANA_OR_PUNCT_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Punctuation}\p{Separator}\dA-Za-zＡ-Ｚａ-ｚ０-９ー]+$/u;
// Ruby base must contain only kanji — no kana, Latin, digits, or other scripts.
const KANJI_ONLY_RE = /^[\u4e00-\u9fff\u3400-\u4dbf]+$/;

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
 * Used to detect when annotation HTML missed a character.
 */
export function findUnannotatedKanji(annotated: string): string[] {
  const stripped = annotated.replace(/<ruby>[\s\S]*?<\/ruby>/g, '');
  return [...stripped.matchAll(/[\u4e00-\u9fff]/g)].map((m) => m[0]);
}

function hasKanji(value: string): boolean {
  return KANJI_RE.test(value);
}

function isKanaOrPunctuationOnly(value: string): boolean {
  return value.length > 0 && ONLY_KANA_OR_PUNCT_RE.test(value) && !hasKanji(value);
}

function renderSpanToHtml(span: FuriganaSpan): string {
  const surface = sanitizeHtml(span.surface, { allowedTags: [], allowedAttributes: {} });
  if (span.reading === null || !hasKanji(span.surface)) {
    return surface;
  }

  const reading = sanitizeHtml(span.reading, { allowedTags: [], allowedAttributes: {} });
  return `<ruby>${surface}<rt>${reading}</rt></ruby>`;
}

function renderFuriganaHtml(spans: readonly FuriganaSpan[]): string {
  return sanitizeHtml(spans.map(renderSpanToHtml).join(''), {
    allowedTags: ['ruby', 'rt', 'rp'],
    allowedAttributes: {},
  });
}


function validateFuriganaSpans(
  chunkText: string,
  spans: readonly FuriganaSpan[]
): string | null {
  if (spans.length === 0) {
    return 'model returned no spans';
  }

  for (const span of spans) {
    if (span.surface.length === 0) {
      return 'model returned an empty surface span';
    }

    if (hasKanji(span.surface) && span.reading === null) {
      return `kanji span "${span.surface}" is missing a reading`;
    }

    if (isKanaOrPunctuationOnly(span.surface) && span.reading !== null) {
      return `kana-only span "${span.surface}" should have reading=null`;
    }

    if (!hasKanji(span.surface) && span.reading !== null) {
      return `non-kanji span "${span.surface}" should not have a reading`;
    }

    // Ruby is valid only when the ruby base is kanji-only. Reject any surface
    // that mixes kanji with kana, Latin, digits, or other scripts.
    if (hasKanji(span.surface) && span.reading !== null && !KANJI_ONLY_RE.test(span.surface)) {
      return `kanji span "${span.surface}" must be kanji-only — split out any kana, Latin, or other characters`;
    }

    if (hasKanji(span.surface) && span.reading !== null && span.reading.trim().length === 0) {
      return `kanji span "${span.surface}" has an empty reading`;
    }
  }

  const reconstructed = spans.map((span) => span.surface).join('');
  if (reconstructed !== chunkText) {
    return `span surfaces reconstruct "${reconstructed}" instead of the original chunk`;
  }

  const html = renderFuriganaHtml(spans);
  const missed = findUnannotatedKanji(html);
  if (missed.length > 0) {
    return `rendered HTML is missing furigana for: ${missed.join('')}`;
  }

  return null;
}

function buildRetryPrompt(
  chunkText: string,
  firstPassSpans: readonly FuriganaSpan[],
  reason: string
): string {
  return `The previous furigana span annotation was suspicious.

Original chunk:
${chunkText}

Previous spans:
${JSON.stringify(firstPassSpans, null, 2)}

Problem detected:
${reason}

Try again and fix the span boundaries. Preserve the original chunk text exactly.
Be especially careful to keep normal lexical compounds together, such as:
- 日本 -> one span with reading にほん
- 日本語 -> one span with reading にほんご
- 留学生 -> one span with reading りゅうがくせい

Also follow this contract strictly:
- A span with a reading must have a kanji-only surface.
- Kana-only spans must use reading=null.
- If a word has okurigana, split it into a kanji span plus a plain kana span.
- Correct: [{"surface":"聞","reading":"き"},{"surface":"いて","reading":null}]
- Wrong: [{"surface":"聞いて","reading":"きいて"}]

Wrong:
- 日 + 本 when the intended compound is 日本
- 日本 + 語 when the intended compound is 日本語

Return spans only. Do not add or remove text. Use reading=null for kana-only spans and punctuation.`;
}

const FURIGANA_PROMPT = `Annotate each Japanese text chunk as structured spans for furigana.

For each chunk, return an ordered "spans" array.
Each span object must contain:
- "surface": exact text from the original chunk
- "reading": hiragana reading for kanji-bearing spans, or null for kana-only / katakana / punctuation / symbols

Rules:
- Concatenating every "surface" in order MUST reproduce the original chunk exactly.
- Group normal lexical compounds into a single span:
  - 日本 -> reading にほん
  - 日本語 -> reading にほんご
  - 留学生 -> reading りゅうがくせい
- Use smaller spans only when the reading genuinely belongs to separate parts:
  - 聞いて -> [{"surface":"聞","reading":"き"},{"surface":"いて","reading":null}]
  - 食べる -> [{"surface":"食","reading":"た"},{"surface":"べる","reading":null}]
- A span with a reading is valid only when its surface is kanji-only.
- Kana-only, katakana-only, punctuation, and symbols must use reading=null.
- Do not add spaces, remove text, or rewrite text.

Wrong examples:
- [{"surface":"日","reading":"にほん"},{"surface":"本","reading":"ほん"}]
- [{"surface":"日本","reading":"にほん"},{"surface":"語","reading":"ご"}]
- [{"surface":"テスト","reading":"てすと"}]
- [{"surface":"聞いて","reading":"きいて"}]

Chunks:
`;

async function annotateChunksWithSpans(
  chunks: readonly TranscriptChunk[],
  anthropic: ReturnType<typeof createAnthropic>
): Promise<Map<number, readonly FuriganaSpan[]>> {
  const chunkList = chunks.map((c, i) => `[${i}] ${c.text}`).join('\n');
  const { object } = await generateObject({
    model: anthropic(CLAUDE_FURIGANA_MODEL),
    schema: furiganaResultSchema,
    prompt: FURIGANA_PROMPT + chunkList,
    temperature: 0,
  });
  return new Map(object.annotated_chunks.map((ac) => [ac.index, ac.spans]));
}

async function retryAnnotateChunk(
  chunk: TranscriptChunk,
  firstPassSpans: readonly FuriganaSpan[],
  reason: string,
  anthropic: ReturnType<typeof createAnthropic>
): Promise<readonly FuriganaSpan[] | undefined> {
  const { object } = await generateObject({
    model: anthropic(CLAUDE_FURIGANA_MODEL),
    schema: furiganaResultSchema,
    prompt: buildRetryPrompt(chunk.text, firstPassSpans, reason),
    temperature: 0,
  });
  return object.annotated_chunks[0]?.spans;
}

function mockChunkWithDefaults(
  chunk: Omit<ChunkWithFurigana, 'furigana_status' | 'furigana_warning'>
): ChunkWithFurigana {
  return {
    ...chunk,
    furigana_status: 'ok',
    furigana_warning: null,
  };
}

/**
 * Annotate each chunk's text with furigana using Claude-generated structured spans.
 * Stored contract:
 * - <ruby> may wrap kanji-only base text
 * - hiragana, katakana, punctuation, and okurigana must remain plain text
 * The spans are validated and rendered into ruby HTML server-side.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function addFurigana(
  chunks: readonly TranscriptChunk[]
): Promise<readonly ChunkWithFurigana[]> {
  if (process.env.USE_MOCKS === 'true') {
    return (furiganaFixture as Omit<ChunkWithFurigana, 'furigana_status' | 'furigana_warning'>[])
      .map(mockChunkWithDefaults);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = createAnthropic({ apiKey });
  const firstPassByIndex = await annotateChunksWithSpans(chunks, anthropic);

  const results: ChunkWithFurigana[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const firstPassSpans = firstPassByIndex.get(i);
    const fallbackText = sanitizeHtml(chunk.text, { allowedTags: [], allowedAttributes: {} });

    const firstReason = firstPassSpans === undefined
      ? 'No furigana annotation was returned for this chunk.'
      : validateFuriganaSpans(chunk.text, firstPassSpans);
    let finalSpans = firstPassSpans ?? [];
    let finalReason = firstReason;

    if (firstReason !== null) {
      console.error(`[addFurigana] chunk ${i} suspicious on first pass: ${firstReason}`);
      const retrySpans = await retryAnnotateChunk(chunk, finalSpans, firstReason, anthropic);
      if (retrySpans !== undefined) {
        finalSpans = retrySpans;
        finalReason = validateFuriganaSpans(chunk.text, retrySpans);
        if (finalReason !== null) {
          console.error(`[addFurigana] chunk ${i} still suspicious after retry: ${finalReason}`);
        }
      } else {
        finalReason = 'Retry did not return any furigana spans.';
        console.error(`[addFurigana] chunk ${i} retry returned no spans`);
      }
    }

    const renderedHtml = finalReason === null
      ? renderFuriganaHtml(finalSpans)
      : (finalSpans.length > 0 ? renderFuriganaHtml(finalSpans) : fallbackText);

    results.push({
      text: chunk.text,
      text_furigana: renderedHtml,
      first_word_index: chunk.first_word_index,
      last_word_index: chunk.last_word_index,
      furigana_status: finalReason === null ? 'ok' : 'suspect',
      furigana_warning: finalReason === null ? null : `This furigana may contain mistakes. ${finalReason}`,
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
