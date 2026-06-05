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
- `episodes.study_status`: `new | studying | learned`
- `segments.sentences`: JSONB array of `{ text, start_ms, end_ms }`
- `segments.furigana_status`: `ok | suspect` — set to `suspect` when furigana validation/repair fails; `furigana_warning` stores the reason
- `study_guides.content`: JSONB — `StudyGuideContent` v2: `{ version: 2, vocabulary, structures, breakdown, translation }`

### API Routes

```
POST/GET         /api/podcasts
GET/DELETE       /api/podcasts/[id]
POST             /api/podcasts/[id]/episodes   — upload + kick off pipeline
GET/DELETE       /api/episodes/[id]
PATCH            /api/episodes/[id]/study      — update study_status, compute next_review
GET              /api/episodes/[id]/segments
GET              /api/segments/[id]/study-guide  — lazy-generates if missing
POST             /api/segments/[id]/study-guide/regenerate
GET              /api/reviews/due
POST             /api/reviews
```

### Processing Pipeline

Upload → ElevenLabs STT → Claude segmenting → Claude furigana → ready. Each step updates `episodes.status`. Frontend polls `/api/episodes/[id]` for status. MVP uses polling; plan to upgrade to Inngest/Trigger.dev if needed.

**Segmenting two-pass approach:**
1. Claude receives full transcript text + word-index list, returns segment boundaries (`first_word_index`, `last_word_index`)
2. Map word indices back to timestamps for `start_ms`/`end_ms`
3. Second Claude call returns structured furigana spans (`{ surface, reading }[]`) per segment; spans are validated, auto-repaired (mixed kana+kanji splits), then rendered to `<ruby>` HTML server-side. Segments that fail validation still store the best-effort HTML but get `furigana_status = 'suspect'`.

### Audio Player

Single `<audio>` element for the whole file. Segment mode uses `currentTime` manipulation (seek to `segment.start_ms / 1000`, pause at `segment.end_ms / 1000`). No audio slicing.

```ts
type PlayerState = {
  mode: 'global' | 'segment';
  isPlaying: boolean;
  isLooping: boolean;
  focusedSegmentId: string | null;
  showFurigana: Record<string, boolean>;
  currentTime: number;
};
```

State management: React `useState`/`useReducer` only — no external state library.

### Pages

```
/                               — podcast list
/podcasts/[id]                  — podcast detail + episode list + upload form
/podcasts/[id]/episodes/[id]    — transcript/study page (main UI)
/review                         — episodes due for spaced repetition review
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

## Spaced Repetition Intervals

`comfortable` advances: 3d → 1w → 2w → 1mo → 3mo. `needs_work` resets to a shorter interval and drops study_status back to `studying`.

## Key Design Decisions

- Drizzle ORM (not Prisma) — lightweight, type-safe, good Vercel Postgres support
- Study guides are lazy-generated and stored; regenerate = `UPDATE` in place (one row per segment, `UNIQUE(segment_id)`)
- Raw ElevenLabs transcript stored in `raw_transcripts.payload` (JSONB) to allow reprocessing without re-calling the API
- Furigana stored as HTML (`<ruby>` tags) in `segments.text_furigana`, not computed client-side
- Claude model IDs are centralized in `src/lib/constants.ts` — update them there when switching models
