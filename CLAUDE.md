# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**聴く (Kiku)** — a Japanese podcast study app. Users upload MP3s, the app transcribes them via ElevenLabs, chunks the transcript into study segments using Claude, adds furigana annotations, and provides a drill-down view with translations and grammar explanations. Includes a spaced repetition review system.

## Tech Stack

- **Framework:** Next.js 14+ with App Router, TypeScript, Tailwind CSS
- **Hosting:** Vercel (Hobby plan — 60s function timeout; may need Pro for long audio files)
- **Database:** Vercel Postgres (Neon) via Drizzle ORM
- **File storage:** Vercel Blob (audio files)
- **External APIs:** ElevenLabs Scribe v2 (transcription), Anthropic Claude (chunking, furigana, drill-downs)

## Common Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Run ESLint
```

To bootstrap (not yet done):
```bash
npx create-next-app@latest kiku-app --typescript --tailwind --app
```

## Architecture

### Data Flow

```
Audio (MP3) → Vercel Blob
    → ElevenLabs STT → raw_transcripts
    → Claude (chunking) → Claude (furigana) → chunks
    → Claude (on demand) → drilldowns
```

### Database Schema

Five core tables: `podcasts`, `episodes`, `raw_transcripts`, `chunks`, `drilldowns`, plus `review_log`.

- `episodes.status`: `uploaded | transcribing | chunking | ready | error`
- `episodes.study_status`: `new | studying | learned`
- `chunks.sentences`: JSONB array of `{ text, start_ms, end_ms }`
- `drilldowns.content`: JSONB — `{ sentences: [{ japanese, english, structures: [{ pattern, explanation, example }] }] }`

### API Routes

```
POST/GET         /api/podcasts
GET/DELETE       /api/podcasts/[id]
POST             /api/podcasts/[id]/episodes   — upload + kick off pipeline
GET/DELETE       /api/episodes/[id]
PATCH            /api/episodes/[id]/study      — update study_status, compute next_review
GET              /api/episodes/[id]/chunks
GET              /api/chunks/[id]/drilldown    — lazy-generates if missing
POST             /api/chunks/[id]/drilldown/regenerate
GET              /api/reviews/due
POST             /api/reviews
```

### Processing Pipeline

Upload → ElevenLabs STT → Claude chunking → Claude furigana → ready. Each step updates `episodes.status`. Frontend polls `/api/episodes/[id]` for status. MVP uses polling; plan to upgrade to Inngest/Trigger.dev if needed.

**Chunking two-pass approach:**
1. Claude receives full transcript text + word-index list, returns chunk boundaries (`first_word_index`, `last_word_index`)
2. Map word indices back to timestamps for `start_ms`/`end_ms`
3. Second Claude call adds `<ruby>` furigana tags to each chunk's text

### Audio Player

Single `<audio>` element for the whole file. Chunk mode uses `currentTime` manipulation (seek to `chunk.start_ms / 1000`, pause at `chunk.end_ms / 1000`). No audio slicing.

```ts
type PlayerState = {
  mode: 'global' | 'chunk';
  isPlaying: boolean;
  isLooping: boolean;
  focusedChunkId: string | null;
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
- `chunks.json` — hand-written Claude chunking output
- `furigana.json` — hand-written furigana annotations
- `drilldown.json` — hand-written drill-down content

API wrappers (e.g., `src/lib/api/elevenlabs.ts`) check `process.env.USE_MOCKS` and return fixtures instead of making real calls.

## Prompt Templates

The Claude prompts are in `docs/kiku-app-plan.md` under "Prompt Templates". The chunking prompt returns `[{ text, first_word_index, last_word_index }]`. The furigana prompt uses `<ruby>` HTML tags (kanji only, not kana). The drill-down prompt returns structured JSON per sentence.

## Spaced Repetition Intervals

`comfortable` advances: 3d → 1w → 2w → 1mo → 3mo. `needs_work` resets to a shorter interval and drops study_status back to `studying`.

## Key Design Decisions

- Drizzle ORM (not Prisma) — lightweight, type-safe, good Vercel Postgres support
- Drilldowns are lazy-generated and stored; regenerate = `UPDATE` in place (one row per chunk, `UNIQUE(chunk_id)`)
- Raw ElevenLabs transcript stored in `raw_transcripts.payload` (JSONB) to allow reprocessing without re-calling the API
- Furigana stored as HTML (`<ruby>` tags) in `chunks.text_furigana`, not computed client-side
