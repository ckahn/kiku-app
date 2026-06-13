import sanitizeHtml from 'sanitize-html';
import type { FuriganaSpan, SegmentWithFurigana, TranscriptSegment } from './types';

const KANJI_RE = /[一-鿿]/;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const ONLY_KANA_OR_PUNCT_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Punctuation}\p{Separator}\dA-Za-zＡ-Ｚａ-ｚ０-９ー]+$/u;
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
// Ruby base must contain only kanji — no kana, Latin, digits, or other scripts.
const KANJI_ONLY_RE = /^[一-鿿㐀-䶿々]+$/;
// 1–2 digit prefix (ASCII or full-width) followed immediately by kanji — calendar date/counter
// compounds like 4月, １日, 20日, ２０日. Capped at 2 digits to avoid generating absurd furigana
// for large numbers (e.g. 355432円). Full-width digits (１–９, ０) are U+FF11–FF19, U+FF10.
// These have compound readings (e.g., 4月=しがつ, 1日=ついたち) that belong to the whole surface.
const DIGIT_KANJI_RE = /^[1-9１-９][0-9０-９]?[一-鿿㐀-䶿]+$/;

/**
 * Returns kanji characters in `annotated` that are not wrapped in a <ruby> tag.
 * Used to detect when annotation HTML missed a character.
 */
export function findUnannotatedKanji(annotated: string): string[] {
  const stripped = annotated.replace(/<ruby>[\s\S]*?<\/ruby>/g, '');
  return [...stripped.matchAll(/[一-鿿]/g)].map((m) => m[0]);
}

export function hasKanji(value: string): boolean {
  return KANJI_RE.test(value);
}

function hasKana(value: string): boolean {
  return KANA_RE.test(value);
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

export function renderFuriganaHtml(spans: readonly FuriganaSpan[]): string {
  return sanitizeHtml(spans.map(renderSpanToHtml).join(''), {
    allowedTags: ['ruby', 'rt', 'rp'],
    allowedAttributes: {},
  });
}

function tokenizeMixedScriptSurface(surface: string): string[] {
  return surface.match(/[\p{Script=Hiragana}\p{Script=Katakana}ー]+|[^\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu) ?? [surface];
}

function repairMixedKanaKanjiSpan(span: FuriganaSpan): readonly FuriganaSpan[] {
  if (span.reading === null || !hasKanji(span.surface)) {
    return [span];
  }

  const tokens = tokenizeMixedScriptSurface(span.surface);
  if (tokens.length === 1) {
    return [span];
  }

  if (!tokens.some((token) => KANA_ONLY_RE.test(token)) || !tokens.some((token) => KANJI_ONLY_RE.test(token))) {
    return [span];
  }

  let readingCursor = 0;
  const repaired: FuriganaSpan[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (KANA_ONLY_RE.test(token)) {
      if (!span.reading.startsWith(token, readingCursor)) {
        return [span];
      }

      repaired.push({
        surface: token,
        reading: null,
      });
      readingCursor += token.length;
      continue;
    }

    if (!KANJI_ONLY_RE.test(token)) {
      return [span];
    }

    const nextKanaToken = tokens.slice(i + 1).find((nextToken) => KANA_ONLY_RE.test(nextToken));

    let nextBoundary: number;
    if (nextKanaToken === undefined) {
      nextBoundary = span.reading.length;
    } else {
      const firstIdx = span.reading.indexOf(nextKanaToken, readingCursor);
      if (firstIdx < 0) {
        return [span];
      }
      // Bail out when the kana token appears more than once in the unconsumed
      // reading — indexOf would pick the wrong boundary.
      if (span.reading.indexOf(nextKanaToken, firstIdx + 1) >= 0) {
        return [span];
      }
      nextBoundary = firstIdx;
    }

    const kanjiReading = span.reading.slice(readingCursor, nextBoundary);
    if (kanjiReading.trim().length === 0) {
      return [span];
    }

    repaired.push({
      surface: token,
      reading: kanjiReading,
    });
    readingCursor = nextBoundary;
  }

  if (readingCursor !== span.reading.length) {
    return [span];
  }

  return repaired;
}

function normalizeKanaOnlySpan(span: FuriganaSpan): FuriganaSpan {
  if (span.reading !== null && isKanaOrPunctuationOnly(span.surface)) {
    return {
      surface: span.surface,
      reading: null,
    };
  }

  return span;
}

export function repairFuriganaSpans(spans: readonly FuriganaSpan[]): readonly FuriganaSpan[] {
  return spans
    .flatMap((span) => repairMixedKanaKanjiSpan(span))
    .map((span) => normalizeKanaOnlySpan(span));
}

export function validateFuriganaSpans(
  segmentText: string,
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

    // Ruby is valid only when the ruby base is kanji-only, or a digit+kanji date/counter
    // compound (e.g. 4月, 1日, 20日) whose reading belongs to the whole surface.
    // Reject anything else that mixes kanji with kana, Latin, or other scripts.
    const isValidRubyBase = KANJI_ONLY_RE.test(span.surface) || DIGIT_KANJI_RE.test(span.surface);
    if (hasKanji(span.surface) && span.reading !== null && !isValidRubyBase) {
      if (hasKana(span.surface)) {
        return `mixed kana+kanji span "${span.surface}" needs manual review — we can auto-fix only simple kana prefixes/suffixes like ご飯 or 同じ`;
      }

      return `kanji span "${span.surface}" must be kanji-only or a digit+kanji date/counter compound — split out any kana, Latin, or other characters`;
    }

    if (hasKanji(span.surface) && span.reading !== null && span.reading.trim().length === 0) {
      return `kanji span "${span.surface}" has an empty reading`;
    }
  }

  const reconstructed = spans.map((span) => span.surface).join('');
  if (reconstructed !== segmentText) {
    return `span surfaces reconstruct "${reconstructed}" instead of the original segment`;
  }

  const html = renderFuriganaHtml(spans);
  const missed = findUnannotatedKanji(html);
  if (missed.length > 0) {
    return `rendered HTML is missing furigana for: ${missed.join('')}`;
  }

  return null;
}

/**
 * Repair, validate, and render furigana spans into a stored `SegmentWithFurigana`.
 * Shared by every furigana source (LLM, tokenizer). `spans` is `undefined` when the source
 * produced no annotation for the segment. Segments that fail validation keep their best-effort
 * HTML and are flagged `suspect` with a warning, never silently shown as correct.
 */
export function spansToSegment(
  segment: TranscriptSegment,
  spans: readonly FuriganaSpan[] | undefined
): SegmentWithFurigana {
  const fallbackText = sanitizeHtml(segment.text, { allowedTags: [], allowedAttributes: {} });
  const repairedSpans = spans === undefined ? [] : repairFuriganaSpans(spans);
  const reason = spans === undefined
    ? 'No furigana annotation was returned for this segment.'
    : validateFuriganaSpans(segment.text, repairedSpans);

  const renderedHtml = reason === null
    ? renderFuriganaHtml(repairedSpans)
    : (repairedSpans.length > 0 ? renderFuriganaHtml(repairedSpans) : fallbackText);

  return {
    text: segment.text,
    text_furigana: renderedHtml,
    first_word_index: segment.first_word_index,
    last_word_index: segment.last_word_index,
    furigana_status: reason === null ? 'ok' : 'suspect',
    furigana_warning: reason === null ? null : `This furigana may contain mistakes. ${reason}`,
  };
}
