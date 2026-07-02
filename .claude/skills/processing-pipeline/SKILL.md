---
name: processing-pipeline
description: Use when working on transcription, segmentation, or episode processing — "how does an episode get processed", changing segmentation behavior or the strategy constants, or debugging an episode stuck in uploaded/transcribing/segmenting.
---

# The episode processing pipeline (as actually implemented)

## Facts that older references get wrong

The app originally used Claude for segmenting and furigana; both were replaced.
Old commits, PR descriptions, and any doc predating mid-2026 may still describe
the Claude version:

- **Segmenting does not use Claude by default.** `TRANSCRIPT_SEGMENTATION_STRATEGY`
  is `'deterministic'` (`src/lib/constants.ts`): pure sentence-splitting, no API call.
- **Furigana does not use Claude by default.** `FURIGANA_STRATEGY` is
  `'tokenizer'` (kuromoji). The Claude prompts in `src/lib/api/claude.ts` are a
  dormant fallback.
- **`docs/kiku-app-plan.md` no longer exists** (`docs/` is empty). The real
  prompts live in `src/lib/api/claude.ts` and `src/lib/api/study-guide-provider.ts`.
- Playback is a Web Audio `AudioEngine`, not a single `<audio>` element
  (see the `player-state-model` skill).

## Who drives the pipeline — critical, non-obvious

There is **no server-side queue, cron, or retry**. The client component
`src/components/EpisodeStatusPoller.tsx` (rendered on the episode page,
`/podcasts/[slug]/episodes/[number]`, while the episode is non-terminal) drives
everything:

- status `uploaded` → it POSTs `/api/episodes/[id]/transcribe` on mount
- polls `GET /api/episodes/[id]` every 2s
- first time it sees `segmenting` → POSTs `/api/episodes/[id]/segment` (once)
- `ready`/`error` are terminal; 90s with no status change → shows "stalled"

Consequence: **if nobody has the page open, processing does not advance.** An
episode "stuck" in `uploaded` or `segmenting` usually just needs its episode
page reopened (the poller re-fires the POST). Stuck in `transcribing` means a
transcribe invocation died mid-flight (e.g. hit the 60s `maxDuration` cap) —
the status guard now blocks re-POSTs, so reset the status in the DB first.

Status guards (both return 409 otherwise):
- transcribe route atomically claims `uploaded → transcribing` via a
  conditional UPDATE (prevents duplicate work under React Strict Mode)
- segment route requires status exactly `'segmenting'`

Happy path: `uploaded → transcribing → segmenting → ready`; any failure →
`error` with the message in `episodes.error_message` and `[transcribe]`/
`[segment]`-prefixed server logs.

## The deterministic segmenter (`src/lib/transcript-segmentation.ts`)

1. `splitTranscriptIntoSentences` — split the word stream on 。！？!?
2. `segmentSentencesByCharacterCount` — greedily pack whole sentences until a
   segment reaches `MINIMUM_SEGMENT_CHARACTERS` (30); a too-short final segment
   merges backward into the previous one.

Sentence-level `{text, start_ms, end_ms}` metadata is threaded through
`attachSentenceMetadata` (segment route) into `segments.sentences` (JSONB).

## Intentional oddities — do not "fix"

- **`insertSegments` gap-filling** (`src/db/segments.ts`): each segment's
  `endMs` is extended to the next segment's `startMs` when there's a gap.
  ElevenLabs compresses word timestamps at phrase boundaries; without this,
  spoken audio falls between segments and is never played.
- **kuromoji dictionary bundling** (`next.config.ts`):
  `outputFileTracingIncludes` forces `node_modules/kuromoji/dict/**` into the
  segment route's serverless bundle. The route key is a **glob** —
  `"/api/episodes/*/segment"`, with `*` not `[id]`, because `[id]` would parse
  as a character class. If furigana generation moves to another route, add that
  route here too, or it works locally and fails only on Vercel.
- **`maxDuration = 60`** on the transcribe and segment routes — Vercel Hobby
  plan ceiling. Long episodes can exceed it; that limitation is known.

## Changing strategies

Both strategy constants are in `src/lib/constants.ts` and are consumed by
`segmentTranscriptByStrategy` / `addFuriganaByStrategy` in
`src/app/api/episodes/[id]/segment/route.ts`. Do not enable the Claude
segmenting branch without asking the user: it costs tokens per episode and the
route's own TODO says to move it to an async job flow first (60s timeout risk).
Keep the Claude branches compilable — they are the intentional fallback.

After changing segmentation or furigana logic, reprocess existing episodes with
the `resegment-episode` skill (no re-transcription needed).

## Verify

`npm run test` (segmenter: `src/lib/__tests__/transcript-segmentation.test.ts`,
route: `src/app/api/episodes/[id]/segment/__tests__/route.test.ts`), then a
mock-mode upload end-to-end: `USE_MOCKS=true`, `npm run dev`, upload an mp3,
watch it reach `ready`.
