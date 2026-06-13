import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_SEGMENT_MODEL, CLAUDE_FURIGANA_MODEL } from '@/lib/constants';
import type {
  SegmentWithFurigana,
  ElevenLabsWord,
  FuriganaSpan,
  TranscriptSegment,
} from './types';
import { spansToSegment } from './furigana';
import segmentsFixture from '../../../fixtures/segments.json';
import furiganaFixture from '../../../fixtures/furigana.json';

const transcriptSegmentSchema = z.object({
  text: z.string(),
  first_word_index: z.number(),
  last_word_index: z.number(),
});

const segmentedTranscriptSchema = z.object({
  segments: z.array(transcriptSegmentSchema),
});

const furiganaSpanSchema = z.object({
  surface: z.string(),
  reading: z.union([z.string(), z.null()]),
});

const furiganaResultSchema = z.object({
  annotated_segments: z.array(z.object({
    index: z.number(),
    spans: z.array(furiganaSpanSchema),
  })),
});

/**
 * Split a raw transcript into study segments using Claude.
 * Returns segment boundaries as word-array indices.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function segmentTranscript(
  fullText: string,
  words: readonly ElevenLabsWord[]
): Promise<readonly TranscriptSegment[]> {
  if (process.env.USE_MOCKS === 'true') {
    return segmentsFixture as TranscriptSegment[];
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = createAnthropic({ apiKey });
  const wordList = words.map((w, i) => `${i}: "${w.text}"`).join('\n');

  const prompt = `You are a Japanese language teacher preparing podcast transcripts for study.

Split the following Japanese transcript into study segments. Each segment should be a coherent paragraph — a complete thought or exchange that can be studied on its own.

Guidelines:
- GROUP related sentences together — a segment is a thematic unit, not a single sentence
- SPLIT only when the topic or speaker's intent clearly shifts
- Typically 2–4 sentences per segment; a single sentence is fine only if it is long (40+ chars) or stands alone topically
- Short filler utterances (はい、ええ、うん、そうですね) must merge with the adjacent sentence

Example — given: こんにちは！ポッドキャストを聞いてくれてありがとうございます。今日は元気ですか？これは日本語を勉強している初心者のためのポッドキャストです。役に立てばうれしいです！
Correct segments:
  segment 1: こんにちは！ポッドキャストを聞いてくれてありがとうございます。今日は元気ですか？
  segment 2: これは日本語を勉強している初心者のためのポッドキャストです。役に立てばうれしいです！
Wrong: splitting each sentence into its own segment.

Each segment object must have:
- "text": the exact concatenated text of those words (spaces between words if present)
- "first_word_index": integer index of the first word in this segment
- "last_word_index": integer index of the last word in this segment

Rules:
- Every word must appear in exactly one segment (no gaps, no overlaps)
- Indices are 0-based and refer to the word list below

Word list (index: "text"):
${wordList}`;

  const { object } = await generateObject({
    model: anthropic(CLAUDE_SEGMENT_MODEL),
    schema: segmentedTranscriptSchema,
    prompt,
  });

  return object.segments;
}

const FURIGANA_PROMPT = `Annotate each Japanese text segment as structured spans for furigana.

For each segment, return an ordered "spans" array.
Each span object must contain:
- "surface": exact text from the original segment
- "reading": hiragana reading for kanji-bearing spans, or null for kana-only / katakana / punctuation / symbols

Rules:
- Concatenating every "surface" in order MUST reproduce the original segment exactly.
- Group normal lexical compounds into a single span:
  - 日本 -> reading にほん
  - 日本語 -> reading にほんご
  - 留学生 -> reading りゅうがくせい
- Use smaller spans only when the reading genuinely belongs to separate parts:
  - 聞いて -> [{"surface":"聞","reading":"き"},{"surface":"いて","reading":null}]
  - 食べる -> [{"surface":"食","reading":"た"},{"surface":"べる","reading":null}]
- A span with a reading is valid only when its surface is kanji-only OR a digit+kanji date/counter compound.
- Kana-only, katakana-only, punctuation, and symbols must use reading=null.
- Do not add spaces, remove text, or rewrite text.
- Dates and counters: keep the number and kanji together as one span and use the correct compound reading:
  - Month names: 1月=いちがつ, 2月=にがつ, 3月=さんがつ, 4月=しがつ, 5月=ごがつ, 6月=ろくがつ, 7月=しちがつ, 8月=はちがつ, 9月=くがつ, 10月=じゅうがつ, 11月=じゅういちがつ, 12月=じゅうにがつ
  - Irregular day readings: 1日=ついたち, 2日=ふつか, 3日=みっか, 4日=よっか, 5日=いつか, 6日=むいか, 7日=なのか, 8日=ようか, 9日=ここのか, 10日=とおか, 14日=じゅうよっか, 20日=はつか, 24日=にじゅうよっか
  - Other days use standard readings (e.g., 15日=じゅうごにち, 25日=にじゅうごにち)

Wrong examples:
- [{"surface":"日","reading":"にほん"},{"surface":"本","reading":"ほん"}]
- [{"surface":"日本","reading":"にほん"},{"surface":"語","reading":"ご"}]
- [{"surface":"テスト","reading":"てすと"}]
- [{"surface":"聞いて","reading":"きいて"}]
- [{"surface":"4","reading":null},{"surface":"月","reading":"がつ"}]  <- wrong, loses month-name context; correct: {"surface":"4月","reading":"しがつ"}
- [{"surface":"1","reading":null},{"surface":"日","reading":"にち"}]  <- wrong; correct: {"surface":"1日","reading":"ついたち"}
- [{"surface":"4月1日","reading":"しがつついたち"}]  <- wrong, month and day must be separate spans; correct: [{"surface":"4月","reading":"しがつ"},{"surface":"1日","reading":"ついたち"}]

Segments:
`;

async function annotateSegmentsWithSpans(
  segments: readonly TranscriptSegment[],
  anthropic: ReturnType<typeof createAnthropic>
): Promise<Map<number, readonly FuriganaSpan[]>> {
  const segmentList = segments.map((c, i) => `[${i}] ${c.text}`).join('\n');
  const { object } = await generateObject({
    model: anthropic(CLAUDE_FURIGANA_MODEL),
    schema: furiganaResultSchema,
    prompt: FURIGANA_PROMPT + segmentList,
    temperature: 0,
  });
  return new Map(object.annotated_segments.map((ac) => [ac.index, ac.spans]));
}

function mockSegmentWithDefaults(
  segment: Omit<SegmentWithFurigana, 'furigana_status' | 'furigana_warning'>
): SegmentWithFurigana {
  return {
    ...segment,
    furigana_status: 'ok',
    furigana_warning: null,
  };
}

/**
 * Annotate each segment's text with furigana using Claude-generated structured spans.
 * Stored contract:
 * - <ruby> may wrap kanji-only base text
 * - hiragana, katakana, punctuation, and okurigana must remain plain text
 * The spans are validated and rendered into ruby HTML server-side.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function addFurigana(
  segments: readonly TranscriptSegment[]
): Promise<readonly SegmentWithFurigana[]> {
  if (process.env.USE_MOCKS === 'true') {
    return (furiganaFixture as Omit<SegmentWithFurigana, 'furigana_status' | 'furigana_warning'>[])
      .map(mockSegmentWithDefaults);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = createAnthropic({ apiKey });
  const firstPassByIndex = await annotateSegmentsWithSpans(segments, anthropic);

  const results: SegmentWithFurigana[] = [];

  for (let i = 0; i < segments.length; i++) {
    const result = spansToSegment(segments[i], firstPassByIndex.get(i));
    if (result.furigana_status === 'suspect') {
      console.error(`[addFurigana] segment ${i} suspicious: ${result.furigana_warning}`);
    }
    results.push(result);
  }

  return results;
}
