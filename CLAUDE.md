# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KIKU (聴く)** — a Japanese podcast study app. Users upload MP3s, the app transcribes them via ElevenLabs, splits the transcript into study segments (deterministic sentence-packing), adds furigana annotations (kuromoji tokenizer), and provides a study guide with translations and grammar explanations (Claude, on demand). Includes a spaced repetition review system.

## Tech Stack

- **Framework:** Next.js 16 with App Router, TypeScript, Tailwind CSS
- **Hosting:** Vercel (Hobby plan — 60s function timeout; may need Pro for long audio files)
- **Database:** Vercel Postgres (Neon) via Drizzle ORM
- **File storage:** Vercel Blob (audio files)
- **External APIs:** ElevenLabs Scribe (transcription), Anthropic Claude (study guides; dormant fallback for segmenting/furigana)
- **Furigana:** kuromoji (IPADIC) tokenizer — deterministic, no API cost
- **AI SDK:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/elevenlabs`) — uses `generateObject` with Zod schemas for structured output

Detailed procedures and guardrails live in the project skills under `.claude/skills/` (re-segmenting, migrations, mocks, pipeline, player state, furigana, route/study-guide recipes, verification). Prefer those over re-deriving from code.

## Common Commands

```bash
npm run dev            # Start dev server
npm run build          # Production build
npm run lint           # Run ESLint
npm run test           # Run all tests once
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
npm run db:generate    # Generate Drizzle migration files
npm run db:migrate     # Apply pending migrations
```

To run a single test file: `npx vitest run src/path/to/file.test.ts`

## Path Aliases

- `@/` → `src/`
- `@fixtures/` → `fixtures/`

## UI Requirements

- All clickable regions must provide a touch target of at least 44px by 44px.
- All clickable regions must show a pointer cursor on mouse hover.
- Do not add unit tests that assert specific CSS utility classes for these requirements.
  If automated coverage is needed, use browser-level checks for computed size and cursor style.

## Architecture

### Data Flow

```
Audio (MP3) → Vercel Blob
    → ElevenLabs STT → raw_transcripts
    → deterministic segmentation → kuromoji furigana → segments
    → Claude (on demand) → study_guides
```

### Database Schema

Five core tables: `podcasts`, `episodes`, `raw_transcripts`, `segments`, `study_guides`, plus `review_log`.

- `episodes.status`: `uploaded | transcribing | segmenting | ready | error`
- `segments.sentences`: JSONB array of `{ text, start_ms, end_ms }`
- `segments.furigana_status`: `ok | suspect` — set to `suspect` when furigana validation/repair fails; `furigana_warning` stores the reason
- `study_guides.content`: JSONB — `StudyGuideContent` v2: `{ version: 2, vocabulary, structures, breakdown, translation }`

### API Routes

```
POST/GET              /api/podcasts
GET/PATCH/DELETE      /api/podcasts/[id]
POST                  /api/podcasts/[id]/episodes             — register episode with blob URL
GET/PATCH/DELETE      /api/episodes/[id]
GET                   /api/episodes/[id]/audio               — serve/redirect to audio blob
POST                  /api/episodes/[id]/transcribe          — call ElevenLabs, store raw transcript
POST                  /api/episodes/[id]/segment             — run segmenting + furigana
PATCH                 /api/episodes/[id]/study               — cascade study status to all segments
GET                   /api/segments/[id]/study-guide         — lazy-generates if missing
POST                  /api/segments/[id]/study-guide/regenerate
PATCH                 /api/segments/[id]/study               — update single segment study status
GET                   /api/segments/random                   — random segment for active study sessions
POST                  /api/blob/upload                       — upload audio file to Vercel Blob
```

### Processing Pipeline

Upload → ElevenLabs STT → deterministic segmentation → kuromoji furigana → ready. Each step updates `episodes.status`. The pipeline is **client-driven**: `EpisodeStatusPoller` (rendered on the episode page while status is non-terminal) fires the transcribe POST, polls `/api/episodes/[id]`, and fires the segment POST when status reaches `'segmenting'`. There is no server-side queue or retry — if no page is open, processing does not advance. Both processing routes have status guards (409 unless the episode is in the expected state). Plan to upgrade to Inngest/Trigger.dev if needed.

Strategy switches live in `src/lib/constants.ts`: `TRANSCRIPT_SEGMENTATION_STRATEGY` (`'deterministic'`, current) and `FURIGANA_STRATEGY` (`'tokenizer'`, current). The Claude branches in `src/lib/api/claude.ts` are kept as an intentional fallback — do not delete them, and do not enable them without asking (per-episode token cost + 60s route timeout risk).

**Re-segmenting without re-transcribing:** To reprocess an episode from the segmenting step (e.g. after changing the segmentation strategy or furigana logic) without paying for another ElevenLabs call: delete the episode's `segments` rows, reset `episodes.status` to `'segmenting'`, then POST to `/api/episodes/[id]/segment`. That route reads from the stored `raw_transcripts` row and re-runs segmenting + furigana. See the `resegment-episode` skill for ordering constraints and data-loss stop conditions.

**Segmenting + furigana (current implementation):**
1. `src/lib/transcript-segmentation.ts` splits the word stream into sentences on 。！？!? and greedily packs whole sentences until each segment reaches `MINIMUM_SEGMENT_CHARACTERS` (30); a too-short final segment merges backward.
2. Word indices map back to timestamps for `start_ms`/`end_ms`; sentence-level timings are stored in `segments.sentences`.
3. `src/lib/api/furigana-tokenizer.ts` produces furigana spans (`{ surface, reading }[]`) from kuromoji tokens, with deterministic number+counter readings and homograph overrides; the shared pipeline in `src/lib/api/furigana.ts` repairs spans (mixed kana+kanji splits) and renders `<ruby>` HTML server-side. On the Claude fallback path, spans that fail validation still store best-effort HTML but get `furigana_status = 'suspect'`. See the `furigana-invariants` skill.

### Audio Player

Playback uses a Web Audio API engine — the module-level singleton `audioEngine` in `src/lib/audio/audioEngine.ts` — not an `<audio>` element. The file is fetched **once** and decoded into a single cached `AudioBuffer` (motivated by Vercel Blob egress limits: seeks are free in-memory operations, never new range requests). Playback rate goes through a SoundTouch worklet for pitch correction. Looping seeks back to the range's first segment on reaching the last segment's `end_ms`, with no pause between iterations. No audio slicing, no per-seek fetching. React connects via `useAudioEngine(url)` (`src/hooks/useAudioEngine.ts`).

```ts
type LoopRange = { firstSegmentId: number; lastSegmentId: number };

type PlayerState = {
  isPlaying: boolean;
  loopRange: LoopRange | null;   // null = not looping; non-null = looping that contiguous range
  currentTime: number;
};
```

`isLooping` is **derived** at the UI boundary (`loopRange !== null`) — there is no separate boolean field. A length-1 range (`firstSegmentId === lastSegmentId`) is the degenerate case equivalent to the single-segment loop.

The range-loop UI exists (loop-range gutter, PR #36): `toggleLoop` anchors the active segment as a length-1 range, and the gutter (`GutterCell.tsx` + `useLoopDrag.ts`) lets the user drag endpoints to grow/shrink the range. `loopRange.ts` exports `makeAnchor`, `validateRange`, `isInRange`, and `setEndpoint`; `usePlayer` exposes `toggleLoop`, `seekToSegment`, `setLoopEndpoint`, and `shiftLoopEndpoint` for loop control. Stale ranges are dropped (not repaired) via `validateRange` when segments change.

**Two loop contexts (scopes are isolated):**

- **Episode page** (`/podcasts/[slug]/episodes/[number]`) — range loop via `loopRange` in `PlayerState` (length-1 on toggle, growable via the gutter). The boundary effect in `usePlayer` seeks back to the range's first segment on reaching the last segment's `end_ms`. No persistence yet (ephemeral per-visit; see `studyNavigation.ts` for the localStorage pattern to follow when persistence is added).
- **Per-segment study page** (`…/segments/[index]/study`) — single-segment loop via local `useState(isLooping)` in `StudyScreen.tsx`. Self-contained; does not import `usePlayer`, `PlayerControls`, or `playerReducer`.

State management: React `useState`/`useReducer` only — no external state library.

### Pages

```
/                                                          — podcast list
/podcasts/[slug]                                           — podcast detail + episode list + upload form
/podcasts/[slug]/episodes/[number]                         — transcript/study page (main UI)
/podcasts/[slug]/episodes/[number]/segments/[index]/study  — per-segment drilldown study page
```

## Development Mocks

To avoid API costs during development, set `USE_MOCKS=true` in `.env.local`. Fixture files live in `/fixtures/`:

- `elevenlabs-transcript.json` — real ElevenLabs response captured once (recapture: `npx tsx scripts/capture-elevenlabs-fixture.ts <audio.mp3>` — paid call)
- `segments.json` — hand-written segmenting output
- `furigana.json` — hand-written furigana annotations
- `study-guide.json` — hand-written study guide content

API wrappers (e.g., `src/lib/api/elevenlabs.ts`) check `process.env.USE_MOCKS` and return fixtures instead of making real calls. The deterministic segmenter ignores `USE_MOCKS` (it's free and always runs real logic); the DB and Blob store are real even in mock mode. Fixture cross-consistency is enforced by `src/lib/api/__tests__/fixtures.test.ts` — see the `mocks-and-fixtures` skill.

## Prompt Templates

The Claude prompts live **in the code**, not in docs (`docs/` is empty; the old plan doc is gone):

- **Study guide** (the only Claude call on the default path): `buildStudyGuidePrompt` in `src/lib/api/study-guide-provider.ts` — returns structured JSON for vocabulary, structures, breakdown, and translation, validated by `studyGuideContentSchema` in `src/lib/api/study-guide.ts`.
- **Fallback segmenting**: in `segmentTranscript` in `src/lib/api/claude.ts` — returns `[{ text, first_word_index, last_word_index }]`.
- **Fallback furigana**: `FURIGANA_PROMPT` in `src/lib/api/claude.ts` — returns structured spans, rendered to `<ruby>` HTML server-side (kanji only, not kana).

## Spaced Repetition

Study status lives on individual segments (`new | studying | learned`). Episode-level status is derived at query time from segment counts (all new → new, all learned → learned, otherwise → studying). `nextReview` is stored on segments but not yet computed — the SRS interval logic (e.g. 3d → 1w → 2w → 1mo → 3mo) is planned but not implemented.

## Key Design Decisions

- Drizzle ORM (not Prisma) — lightweight, type-safe, good Vercel Postgres support
- Deterministic segmentation + kuromoji furigana replaced the original Claude calls (free, fast, reproducible); the Claude branches remain as switchable fallbacks via the strategy constants
- Web Audio decode-once engine replaced the `<audio>` element to cut Vercel Blob egress (seeks and loops are in-memory, not new range requests)
- Study guides are lazy-generated and stored; regenerate = `UPDATE` in place (one row per segment, `UNIQUE(segment_id)`); `STUDY_GUIDE_CURRENT_VERSION` bumps invalidate the cache
- Raw ElevenLabs transcript stored in `raw_transcripts.payload` (JSONB) to allow reprocessing without re-calling the API
- Furigana stored as HTML (`<ruby>` tags) in `segments.text_furigana`, not computed client-side
- Claude model IDs are centralized in `src/lib/constants.ts` — update them there when switching models
