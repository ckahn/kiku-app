import path from 'node:path';
import { builder } from 'kuromoji';
import type { IpadicFeatures, Tokenizer } from 'kuromoji';
import type { FuriganaSpan, SegmentWithFurigana, TranscriptSegment } from './types';
import { hasKanji, spansToSegment } from './furigana';
import { counterReading, parseCounterNumber, isKnownCounter } from './counter-readings';
import furiganaFixture from '../../../fixtures/furigana.json';

// Katakana block used by kuromoji's `reading` field (U+30A1–U+30F6). The prolonged sound mark
// ー (U+30FC) and anything outside the block are passed through unchanged.
const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;

// IPADIC picks the less-common reading for some homographs in everyday speech.
// Override unconditionally for the whole surface; extend when new cases are confirmed.
const READING_OVERRIDES: Readonly<Record<string, string>> = {
  日本: 'にほん', // IPADIC returns にっぽん; にほん is standard in conversational Japanese
};

/** Convert kuromoji's katakana reading into the hiragana shown inside <rt>. */
export function readingToHiragana(katakana: string): string {
  let out = '';
  for (const ch of katakana) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= KATAKANA_START && code <= KATAKANA_END
      ? String.fromCodePoint(code - KANA_OFFSET)
      : ch;
  }
  return out;
}

function resolveDicPath(): string {
  // Bundled into the serverless function via outputFileTracingIncludes; process.cwd() is the
  // function root locally and on Vercel. KUROMOJI_DIC_PATH overrides for unusual layouts.
  return process.env.KUROMOJI_DIC_PATH
    ?? path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');
}

let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;

/** Lazily build and cache the kuromoji tokenizer (dictionary load is ~1s; reused across calls). */
export function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (tokenizerPromise === null) {
    tokenizerPromise = new Promise((resolve, reject) => {
      builder({ dicPath: resolveDicPath() }).build((err, tokenizer) => {
        if (err) {
          tokenizerPromise = null; // reset so a transient failure can be retried
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

function tokenToSpan(token: IpadicFeatures): FuriganaSpan {
  const surface = token.surface_form;
  if (!hasKanji(surface)) {
    return { surface, reading: null };
  }

  const override = READING_OVERRIDES[surface];
  if (override !== undefined) {
    return { surface, reading: override };
  }

  // Out-of-vocabulary kanji: kuromoji returns no reading. Leave it unread so the segment is
  // flagged `suspect` rather than guessing a wrong reading.
  const reading = token.reading;
  if (reading === undefined || reading === '*') {
    return { surface, reading: null };
  }

  return { surface, reading: readingToHiragana(reading) };
}

// A single kuromoji token that is itself a number+counter compound (e.g. ４月). Returns the
// deterministic counter reading, or null when it is not a known number+counter.
function singleTokenCounterReading(surface: string): string | null {
  if (surface.length < 2) return null;
  const counter = surface.slice(-1);
  const numberPart = surface.slice(0, -1);
  if (!isKnownCounter(counter)) return null;
  if (parseCounterNumber(numberPart) === null) return null;
  return counterReading(numberPart, counter);
}

// Length of the run of consecutive number tokens starting at `start` (kuromoji splits compound
// numerals: 二十 → 二 + 十). Used to merge a whole number with the counter that follows it.
function numberRunLength(tokens: readonly IpadicFeatures[], start: number): number {
  let end = start;
  while (end < tokens.length && parseCounterNumber(tokens[end].surface_form) !== null) {
    end += 1;
  }
  return end - start;
}

/**
 * Map kuromoji tokens to furigana spans, overriding number+counter compounds with deterministic
 * readings (kuromoji ignores rendaku/gemination). Handles the split form (3 + 匹, 二 + 十 + 歳) and
 * the single-token form (４月). Everything else uses kuromoji's dictionary reading; the shared
 * repair step then splits okurigana like 食べる → 食(た)べる.
 */
function tokensToSpans(tokens: readonly IpadicFeatures[]): FuriganaSpan[] {
  const spans: FuriganaSpan[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const runLength = numberRunLength(tokens, i);
    const counterToken = tokens[i + runLength];

    if (runLength > 0 && counterToken !== undefined && isKnownCounter(counterToken.surface_form)) {
      const numberSurface = tokens.slice(i, i + runLength).map((t) => t.surface_form).join('');
      const reading = counterReading(numberSurface, counterToken.surface_form);
      if (reading !== null) {
        spans.push({ surface: numberSurface + counterToken.surface_form, reading });
        i += runLength; // skip the number run; loop increment skips the counter
        continue;
      }
    }

    const singleReading = singleTokenCounterReading(tokens[i].surface_form);
    if (singleReading !== null) {
      spans.push({ surface: tokens[i].surface_form, reading: singleReading });
      continue;
    }

    // 何 (nani) → なん before copula/auxiliary forms (です, だ) and the particle で.
    // Kuromoji defaults to ナニ regardless of context; the following token disambiguates.
    // There is no standard Japanese context where なにで or なにだ is the correct reading.
    if (tokens[i].surface_form === '何' && i + 1 < tokens.length) {
      const next = tokens[i + 1].surface_form;
      if (next === 'だ' || next.startsWith('で')) {
        spans.push({ surface: '何', reading: 'なん' });
        continue;
      }
    }

    spans.push(tokenToSpan(tokens[i]));
  }

  return spans;
}

function mockSegment(
  segment: Omit<SegmentWithFurigana, 'furigana_status' | 'furigana_warning'>
): SegmentWithFurigana {
  return { ...segment, furigana_status: 'ok', furigana_warning: null };
}

/**
 * Annotate each segment's text with furigana using a kuromoji tokenizer. Readings are
 * dictionary-backed and deterministic; number+counter compounds are corrected from a table.
 * Spans are validated and rendered to ruby HTML by the shared furigana pipeline.
 *
 * Set USE_MOCKS=true to return fixture data.
 */
export async function addFuriganaWithTokenizer(
  segments: readonly TranscriptSegment[]
): Promise<readonly SegmentWithFurigana[]> {
  if (process.env.USE_MOCKS === 'true') {
    return (furiganaFixture as Omit<SegmentWithFurigana, 'furigana_status' | 'furigana_warning'>[])
      .map(mockSegment);
  }

  const tokenizer = await getTokenizer();

  return segments.map((segment, i) => {
    const spans = tokensToSpans(tokenizer.tokenize(segment.text));
    const result = spansToSegment(segment, spans);
    if (result.furigana_status === 'suspect') {
      console.error(`[addFuriganaWithTokenizer] segment ${i} suspicious: ${result.furigana_warning}`);
    }
    return result;
  });
}
