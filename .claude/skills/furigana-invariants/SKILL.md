---
name: furigana-invariants
description: Use when changing furigana generation, ruby HTML rendering, span validation or repair, kuromoji tokenizer readings, furigana_status/suspect handling, or fixing a wrong-reading bug (counters, dates, 何, homographs).
---

# Furigana pipeline invariants

All furigana flows through the span contract in `src/lib/api/furigana.ts`,
whatever the source (kuromoji tokenizer — the default — or the Claude
fallback):

```ts
type FuriganaSpan = { surface: string; reading: string | null };
```

## Invariants (enforced by `validateFuriganaSpans`)

1. Concatenating every `surface` in order must reproduce the segment text
   **exactly** — no added spaces, no dropped characters.
2. `reading` is hiragana and only on kanji-bearing spans; kana-only,
   punctuation, and Latin spans must have `reading: null`.
3. A ruby base (span with a reading) must be **kanji-only** (`KANJI_ONLY_RE`)
   or a digit+kanji date/counter compound (`DIGIT_KANJI_RE`, max 2-digit
   prefix — e.g. 4月, 20日). Mixed kana+kanji surfaces with a reading are
   invalid; okurigana stays outside the ruby (食べる → 食(た) + べる).

## Pipeline order (do not reorder)

spans → `repairFuriganaSpans` → `validateFuriganaSpans` → `renderFuriganaHtml`
→ stored as HTML in `segments.text_furigana`. **Server-side only** — never
compute furigana client-side; the client renders the stored HTML.

- **Repair before validate**: `repairFuriganaSpans` auto-splits simple mixed
  kana+kanji spans by walking the reading, and normalizes kana-only spans to
  `reading: null`. It bails (returns the span unchanged) on any ambiguity —
  e.g. the kana token appearing twice in the remaining reading — leaving
  validation to flag it. Don't make repair "smarter" at the cost of guessing.
- **Rendering sanitizes twice** with `sanitize-html`: surfaces/readings are
  stripped of all tags, and the final HTML allows only `ruby`/`rt`/`rp`. The
  stored HTML is injected into the page, so this is the XSS boundary — keep it.

## `suspect` semantics

`spansToSegment` (same file) is the LLM-path entry point: on validation
failure the segment is **not dropped** — best-effort HTML (or plain sanitized
text if there are no usable spans) is stored with
`furigana_status: 'suspect'` and `furigana_warning` = "This furigana may
contain mistakes. <reason>". The UI surfaces the warning. Never let furigana
that failed validation be stored as `'ok'`, and never discard a segment because
its furigana is bad — text with a warning beats no text.

**Known discrepancy:** `addFuriganaWithTokenizer`
(`src/lib/api/furigana-tokenizer.ts`) does *not* go through `spansToSegment` —
it calls repair + render directly and hardcodes `furigana_status: 'ok'`, even
though comments in that file (OOV kanji handling) assume suspect-flagging
happens. If your change touches this area, prefer routing the tokenizer path
through `spansToSegment` rather than replicating the hardcoded `'ok'`.

## Tokenizer specifics (`furigana-tokenizer.ts`)

- kuromoji + IPADIC; the dictionary loads lazily (~1s) and the tokenizer
  promise is cached module-level. The dict ships to Vercel via
  `outputFileTracingIncludes` in `next.config.ts` — see the
  `processing-pipeline` skill before moving this code to another route.
- Readings come back as katakana; `readingToHiragana` converts (U+30A1–U+30F6
  shifted by 0x60; ー passes through).
- `READING_OVERRIDES` fixes IPADIC homograph choices (日本 → にほん, not
  にっぽん). Extend this table for confirmed wrong readings of whole surfaces.
- Number+counter compounds are overridden via `counterReading` in
  `src/lib/api/counter-readings.ts` because kuromoji ignores
  rendaku/gemination (3匹 = さんびき, not さんひき). Handles kuromoji's split
  form (二 + 十 + 歳) and single-token form (４月). Numbers outside 1–100 fall
  through to kuromoji's non-rendaku reading — a known limitation.
- Contextual 何: read なん before だ/で-initial next tokens, else kuromoji's
  なに.
- OOV kanji (kuromoji reading `*`) get `reading: null` deliberately — an
  unread kanji beats a guessed wrong reading.

## Verify

```bash
npx vitest run src/lib/api/__tests__/furigana.test.ts \
  src/lib/api/__tests__/furigana-tokenizer.test.ts \
  src/lib/api/__tests__/counter-readings.test.ts
```

Coverage thresholds (80%) apply to `src/lib/api/**` — new branches here need
tests. For a reading bug, add the failing surface to the tokenizer test first,
then fix via `READING_OVERRIDES`, the counter table, or a targeted rule —
never by weakening `validateFuriganaSpans`. To apply fixes to existing
episodes, reprocess with the `resegment-episode` skill.
