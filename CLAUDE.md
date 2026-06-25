# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KIKU (聴く)** — a Japanese podcast study app. Users upload MP3s, the app transcribes them via ElevenLabs, segments the transcript into study segments and add furigana annotations using Claude, adds furigana annotations, and provides a study guide with translations and grammar explanations (also via Claude). Includes a spaced repetition review system.

## Tech Stack

- **Framework:** Next.js 14+ with App Router, TypeScript, Tailwind CSS
- **Hosting:** Vercel (Hobby plan — 60s function timeout; may need Pro for long audio files)
- **Database:** Vercel Postgres (Neon) via Drizzle ORM
- **File storage:** Vercel Blob (audio files)
- **External APIs:** ElevenLabs Scribe v2 (transcription), Anthropic Claude (segmenting, furigana, study guides)
- **AI SDK:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) — uses `generateObject` with Zod schemas for structured output

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
    → Claude (segmenting) → Claude (furigana) → segments
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
POST                  /api/episodes/[id]/segment             — run Claude segmenting + furigana
PATCH                 /api/episodes/[id]/study               — cascade study status to all segments
GET                   /api/segments/[id]/study-guide         — lazy-generates if missing
POST                  /api/segments/[id]/study-guide/regenerate
PATCH                 /api/segments/[id]/study               — update single segment study status
GET                   /api/segments/random                   — random segment for active study sessions
POST                  /api/blob/upload                       — upload audio file to Vercel Blob
```

### Processing Pipeline

Upload → ElevenLabs STT → Claude segmenting → Claude furigana → ready. Each step updates `episodes.status`. Frontend polls `/api/episodes/[id]` for status. MVP uses polling; plan to upgrade to Inngest/Trigger.dev if needed.

**Re-segmenting without re-transcribing:** To reprocess an episode from the segmenting step (e.g. after changing the segmentation strategy or furigana logic) without paying for another ElevenLabs call: delete the episode's `segments` rows, reset `episodes.status` to `'segmenting'`, then POST to `/api/episodes/[id]/segment`. That route reads from the stored `raw_transcripts` row and runs the full Claude segmenting + furigana pipeline.

**Segmenting two-pass approach:**
1. Claude receives full transcript text + word-index list, returns segment boundaries (`first_word_index`, `last_word_index`)
2. Map word indices back to timestamps for `start_ms`/`end_ms`
3. Second Claude call returns structured furigana spans (`{ surface, reading }[]`) per segment; spans are validated, auto-repaired (mixed kana+kanji splits), then rendered to `<ruby>` HTML server-side. Segments that fail validation still store the best-effort HTML but get `furigana_status = 'suspect'`.

### Audio Player

Single `<audio>` element for the whole file. Segment mode uses `currentTime` manipulation (seek to `segment.start_ms / 1000`, pause at `segment.end_ms / 1000`). No audio slicing.

```ts
type LoopRange = { firstSegmentId: number; lastSegmentId: number };

type PlayerState = {
  mode: 'global' | 'segment';
  isPlaying: boolean;
  loopRange: LoopRange | null;   // null = not looping; non-null = looping that contiguous range
  focusedSegmentId: string | null;
  showFurigana: Record<string, boolean>;
  currentTime: number;
};
```

`isLooping` is **derived** at the UI boundary (`loopRange !== null`) — there is no separate boolean field. A length-1 range (`firstSegmentId === lastSegmentId`) is the degenerate case equivalent to the old single-segment loop.

**Two loop contexts (scopes are isolated):**

- **Episode page** (`/podcasts/[slug]/episodes/[number]`) — contiguous range loop via `loopRange` in `PlayerState`. The user anchors a segment, then grows/shrinks the range with dedicated handles. Persistence is deferred (ephemeral per-visit for now; see `studyNavigation.ts` for the localStorage pattern to follow in the follow-up PR).
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

- `elevenlabs-transcript.json` — real ElevenLabs response captured once
- `segments.json` — hand-written Claude segmenting output
- `furigana.json` — hand-written furigana annotations
- `study-guide.json` — hand-written study guide content

API wrappers (e.g., `src/lib/api/elevenlabs.ts`) check `process.env.USE_MOCKS` and return fixtures instead of making real calls.

## Prompt Templates

The Claude prompts are in `docs/kiku-app-plan.md` under "Prompt Templates". The segmenting prompt returns `[{ text, first_word_index, last_word_index }]`. The furigana prompt uses `<ruby>` HTML tags (kanji only, not kana). The study-guide prompt returns structured JSON for vocabulary, structure, breakdown, and translation.

## Spaced Repetition

Study status lives on individual segments (`new | studying | learned`). Episode-level status is derived at query time from segment counts (all new → new, all learned → learned, otherwise → studying). `nextReview` is stored on segments but not yet computed — the SRS interval logic (e.g. 3d → 1w → 2w → 1mo → 3mo) is planned but not implemented.

## Key Design Decisions

- Drizzle ORM (not Prisma) — lightweight, type-safe, good Vercel Postgres support
- Study guides are lazy-generated and stored; regenerate = `UPDATE` in place (one row per segment, `UNIQUE(segment_id)`)
- Raw ElevenLabs transcript stored in `raw_transcripts.payload` (JSONB) to allow reprocessing without re-calling the API
- Furigana stored as HTML (`<ruby>` tags) in `segments.text_furigana`, not computed client-side
- Claude model IDs are centralized in `src/lib/constants.ts` — update them there when switching models
