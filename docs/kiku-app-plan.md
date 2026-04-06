# 聴く (Kiku) — Japanese Podcast Study App

## Technical Plan

---

## Architecture Overview

**Stack:** Next.js 14+ (App Router) → Vercel → Vercel Postgres (Neon) → Vercel Blob

**External APIs:**
- **ElevenLabs Scribe v2** — transcription with word-level timestamps
- **Anthropic Claude** — chunking, furigana annotation, drill-down content (translations + grammar guides)

**Core data flow:**
```
Audio file (MP3) ──upload──▶ Vercel Blob (storage)
                  │
                  ▼
            ElevenLabs STT ──▶ Raw transcript (words + timestamps)
                  │
                  ▼
            Claude API ──▶ Chunked transcript with furigana
                  │
                  ▼
            Postgres (episode, chunks, drill-downs)
                  │
                  ▼
            Transcript UI (interactive player + reader)
```

**Likely next pipeline enhancement:**
- Add a transcript normalization step between STT and chunking.
- Purpose: remove non-speech metadata like parenthetical sound-effect notes, normalize obvious transcript formatting issues, and optionally rewrite orthography into more natural study text (for example, using kanji where appropriate such as `色々` instead of `いろいろ`).
- Important constraint: keep the raw ElevenLabs transcript immutable and store any normalized transcript separately so the app can reprocess from the source transcript at any time.

---

## Data Model

```sql
-- Enum types
CREATE TYPE episode_status AS ENUM ('uploaded', 'transcribing', 'chunking', 'ready', 'error');
CREATE TYPE study_status AS ENUM ('new', 'studying', 'learned');
CREATE TYPE review_outcome AS ENUM ('comfortable', 'needs_work');

-- Podcast: groups episodes together
CREATE TABLE podcasts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,                     -- optional cover art (Vercel Blob)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Episode metadata + processing status
CREATE TABLE episodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id    UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  episode_number INTEGER,
  audio_url     TEXT NOT NULL,          -- Vercel Blob URL
  duration_ms   INTEGER,                -- total duration
  status        episode_status NOT NULL DEFAULT 'uploaded',
  study_status  study_status NOT NULL DEFAULT 'new',
  learned_at    TIMESTAMPTZ,            -- when user marked "learned"
  next_review   TIMESTAMPTZ,            -- spaced repetition: when to revisit
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- The raw ElevenLabs transcript (stored for reprocessing)
CREATE TABLE raw_transcripts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,           -- full ElevenLabs response
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks: short paragraph-sized segments with timestamps
CREATE TABLE chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id      UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,     -- ordering
  text_raw        TEXT NOT NULL,         -- plain Japanese text
  text_furigana   TEXT NOT NULL,         -- HTML/annotated with furigana (<ruby> tags)
  start_ms        INTEGER NOT NULL,     -- audio start time
  end_ms          INTEGER NOT NULL,     -- audio end time
  sentences       JSONB NOT NULL,        -- array of { text, start_ms, end_ms }
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id, chunk_index)
);

-- Drill-downs: lazy-loaded, regenerable
CREATE TABLE drilldowns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id        UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  content         JSONB NOT NULL,        -- structured translation + grammar data
                  -- {
                  --   sentences: [{
                  --     japanese: "...",
                  --     english: "...",
                  --     structures: [{
                  --       pattern: "〜てしまう",
                  --       explanation: "...",
                  --       example: "..."
                  --     }]
                  --   }]
                  -- }
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chunk_id)  -- one active drilldown per chunk; regenerate = UPDATE
);

-- Review history: tracks revisit outcomes for spaced repetition
CREATE TABLE review_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  outcome     review_outcome NOT NULL
);
```

---

## Chunking Strategy

The chunking pipeline runs server-side after transcription:

1. **ElevenLabs returns** an array of words with `{ text, start, end, type }` timestamps.
2. **Reconstruct full text** from words, preserving punctuation.
3. **Send to Claude** with a prompt like:

```
Given this Japanese transcript, split it into chunks of 2-4 sentences each.
Each chunk should be a coherent thought or exchange.
Return the split points as sentence boundaries (character offsets).
Keep chunks under ~80 characters when possible, max ~150.
```

4. **Map sentence boundaries back to word timestamps** — each chunk gets a `start_ms` (first word's start) and `end_ms` (last word's end).
5. **Second Claude call: add furigana** — annotate each chunk's text with `<ruby>` tags for kanji readings.
6. **Store chunks** in Postgres.

This two-pass approach (chunk → annotate) keeps prompts focused and lets you adjust either step independently.

---

## API Routes

```
POST   /api/podcasts                — create a podcast
GET    /api/podcasts                — list all podcasts
GET    /api/podcasts/[id]           — podcast detail + episode list
DELETE /api/podcasts/[id]           — delete podcast + cascade

POST   /api/podcasts/[id]/episodes  — upload audio for this podcast, kick off pipeline
GET    /api/episodes/[id]           — episode detail + status
DELETE /api/episodes/[id]           — delete episode + cascade
PATCH  /api/episodes/[id]/study     — update study_status (studying/learned), compute next_review

GET    /api/episodes/[id]/chunks    — all chunks for an episode

GET    /api/chunks/[id]/drilldown   — get or lazy-generate drilldown
POST   /api/chunks/[id]/drilldown/regenerate — force regenerate

GET    /api/reviews/due             — episodes due for review (next_review <= now)
POST   /api/reviews                 — log a review outcome, update next_review
```

---

## Processing Pipeline (Background Jobs)

Vercel's free tier doesn't support long-running background jobs natively.
Options, in order of simplicity:

1. **Vercel Functions with streaming / long timeout** — Pro plan gives 5 min timeout.
   For a 15-min MP3, ElevenLabs transcription takes ~30-60s, then Claude chunking ~10-20s.
   This likely fits in one function invocation if you chain them.

2. **Inngest or Trigger.dev** — free-tier serverless job queues that integrate with Vercel.
   Better if you want retries, step-based pipelines, and visibility into job status.

3. **Simple polling** — the upload endpoint returns immediately, stores status as "transcribing",
   and a separate API route `/api/episodes/[id]/process` does the work when polled.
   The frontend polls for status. Crude but works for single-user.

**Recommendation:** Start with option 3 (polling) for MVP, upgrade to Inngest if it gets painful.

### Pipeline steps:

```
1. Upload audio → Vercel Blob → save episode (status: "uploaded")
2. POST to ElevenLabs STT → save raw transcript → (status: "transcribing")
3. Claude: chunk transcript → (status: "chunking")
4. Claude: add furigana to chunks → save chunks → (status: "ready")
```

Each step updates `episodes.status`. The frontend polls `/api/episodes/[id]` and
renders a progress indicator.

**Possible future pipeline shape:**

```
1. Upload audio → save episode (status: "uploaded")
2. Transcribe audio with ElevenLabs → save raw transcript (status: "transcribing")
3. Normalize transcript → remove parenthetical metadata / clean orthography (status: "normalizing")
4. Chunk transcript with Claude (status: "chunking")
5. Add furigana to chunks with Claude → save chunks (status: "ready")
```

This should be treated as a separate feature, not a quick prompt tweak, because it likely requires:
- A schema change to store normalized transcript data separately from raw STT output
- A new processing status and UI state
- Retry/reprocess controls that can restart from the normalized or raw transcript as appropriate

### Page Structure

```
/                                   → podcast list (cards with name + episode count)
/podcasts/[id]                      → podcast detail + episode list + upload form
/podcasts/[id]/episodes/[id]        → transcript/study page
/review                             → episodes due for review
```

---

## Frontend: Transcript Page

### Layout

```
┌─────────────────────────────────────────────┐
│  Podcast Name — Episode Title               │
│  ▶ ⏪5s  ━━━━━━●━━━━━━━━━━━  ⏩5s  🔁      │  ← Global player bar
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ Chunk 1 ─────────────────────────────┐  │
│  │ 日本語テキスト（ふりがな toggle）        │  │  ← Click to focus
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Chunk 2 (focused) ──────────────────┐  │
│  │ 日本語テキスト with ふりがな           │  │
│  │                                       │  │
│  │ ▶ ⏪5s  ━━●━━━━━━  ⏩5s  🔁           │  │  ← Chunk player
│  │ [Show furigana] [Drill-down ▼]        │  │
│  │                                       │  │
│  │ ┌─ Drill-down ──────────────────────┐ │  │
│  │ │ 「日本語」→ "English translation"  │ │  │
│  │ │  Pattern: 〜てしまう               │ │  │
│  │ │  Means: "ended up doing ~"         │ │  │
│  │ │  Example: 食べてしまった            │ │  │
│  │ └──────────────────────────────────┘ │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Chunk 3 ─────────────────────────────┐  │
│  │ ...                                   │  │
│  └───────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

### Audio Playback Architecture

Use a **single `<audio>` element** for the whole file. Control playback via `currentTime`:

- **Global play**: normal playback, highlight current chunk as it plays.
- **Chunk play**: set `currentTime = chunk.start_ms / 1000`, listen for `timeupdate`,
  pause when `currentTime >= chunk.end_ms / 1000` (or loop back to start).
- **Rewind/FF**: `audio.currentTime += 5` or `-= 5`, clamped to chunk bounds when focused.
- **Loop**: on reaching chunk end, set `currentTime` back to chunk start.

This avoids loading multiple audio elements or slicing files.

### State Management

React state (useState/useReducer) is fine for this — no need for a state library:

```ts
type PlayerState = {
  mode: 'global' | 'chunk';
  isPlaying: boolean;
  isLooping: boolean;
  focusedChunkId: string | null;
  showFurigana: Record<string, boolean>;  // per-chunk toggle
  currentTime: number;                     // synced from <audio> timeupdate
};
```

---

## Milestones

### Milestone 0: Foundation (Skeleton + Upload + Storage)
**Goal:** Create a podcast, upload an MP3 episode to it, see it listed.

- [x] `npx create-next-app` with App Router, TypeScript, Tailwind
- [x] Set up Vercel Postgres — schema migration (use Drizzle ORM or raw SQL via `@vercel/postgres`)
- [x] Set up Vercel Blob for audio storage
- [x] Build podcast list page (`/`) — create podcast form + list of existing podcasts
- [x] Build podcast detail page (`/podcasts/[id]`) — metadata, episode list, upload form
- [x] `POST /api/podcasts` — create a podcast
- [x] `DELETE /api/podcasts/[id]` — delete podcast + cascade
- [x] `POST /api/podcasts/[id]/episodes` — upload audio to Blob, insert episode row
- [x] `DELETE /api/episodes/[id]` — delete episode + cascade
- [x] Episode detail page (`/podcasts/[id]/episodes/[id]`) — just metadata for now
- [x] Deploy to Vercel, confirm end-to-end flow works

**Deliverable:** You can create a podcast, upload episodes to it, and navigate the hierarchy.

---

### Milestone 1: Dev Mocks + API Fixtures
**Goal:** Establish development workflow that avoids unnecessary API costs.

- [x] Hand-craft fixture files based on the real Scribe v2 response format:
  - `fixtures/elevenlabs-transcript.json` — 36-word Japanese excerpt (~49s) with word-level timestamps, `speaker_id`, `logprob`
  - `fixtures/chunks.json` — 5 chunks with `first_word_index`/`last_word_index`
  - `fixtures/furigana.json` — `<ruby>` annotations (kanji only)
  - `fixtures/drilldown.json` — sentence translations + grammar structures
- [x] Build mock layer in `src/lib/api/` — `USE_MOCKS=true` swaps API calls for fixtures:
  - `src/lib/api/types.ts` — shared domain types
  - `src/lib/api/elevenlabs.ts` — `transcribe()` with mock/real/key-guard branches
  - `src/lib/api/claude.ts` — `chunkTranscript()`, `addFurigana()`, `generateDrilldown()`
- [x] Add `USE_MOCKS=true` to `.env.local` as default for development
- [x] Write fixture consistency test suite (37 tests, 100% coverage on API layer)
- [x] Add `scripts/capture-elevenlabs-fixture.ts` to replace hand-crafted fixture with real API response when ready
- [x] Set up GitHub Actions CI (lint + test on push/PR to `main` and `preview`)

**Deliverable:** Full pipeline testable locally with zero API costs. Flip `USE_MOCKS=false`
when you need to test against real APIs.

---

### Milestone 1.5: Design Foundation
**Goal:** Establish a visual design system before building the transcript/study UI, so M2+ screens look good from the start rather than being rebuilt in M6.

- [ ] Choose and load Japanese font (Noto Sans JP) alongside a Latin fallback
- [ ] Define Tailwind theme tokens: color palette, spacing scale, typography scale
- [ ] Polish existing screens (podcast list, podcast detail, episode detail) to production quality
- [ ] Establish reusable component patterns: cards, status badges, form inputs, buttons, page layout shell
- [ ] Responsive layout (mobile-first — this is a listening app)

**Deliverable:** Existing screens look intentional. A consistent visual language is in place for all future milestones to build on.

---

### Milestone 2: Transcription Pipeline
**Goal:** Upload triggers transcription, raw transcript is stored.

- [ ] Integrate ElevenLabs STT API (`POST /v1/speech-to-text`)
  - Use `model_id: "scribe_v2"`, `language_code: "ja"`, `timestamps_granularity: "word"`
  - Optionally enable `diarize: true` if podcasts have multiple speakers
- [ ] Build processing endpoint: after upload, call ElevenLabs, store raw transcript in `raw_transcripts`
- [ ] Add status polling: frontend polls episode status, shows progress
- [ ] Display raw transcript text on the episode page (just plain text, no chunking yet)

**Deliverable:** Upload an MP3 → see the Japanese transcript appear after processing.

---

### Milestone 3: Chunking + Furigana
**Goal:** Raw transcript is split into learner-friendly chunks with furigana.

- [ ] Build Claude chunking prompt — input: raw transcript text + word timestamps,
  output: array of chunks with sentence boundaries
- [ ] Map chunk boundaries back to word-level timestamps (start_ms, end_ms per chunk)
- [ ] Build Claude furigana prompt — input: chunk text,
  output: same text with `<ruby>` annotation
- [ ] Store chunks in `chunks` table
- [ ] Update pipeline: transcribe → chunk → annotate → status "ready"
- [ ] Render chunks on episode page as a vertical list of text blocks
- [ ] Remove static Japanese typography sample added in M1.5 Step 7 (`src/app/podcasts/[slug]/episodes/[number]/page.tsx`)

**Deliverable:** Episode page shows chunked Japanese text with furigana.

---

### Milestone 4: Audio Player (Global + Chunk)
**Goal:** Play the full episode or play individual chunks with full controls.

- [ ] Build global audio player component (play/pause, progress bar, rewind/FF 5s, loop, restart)
- [ ] Sync playback position to chunk highlighting (as audio plays, highlight current chunk)
- [ ] Build chunk focus mode: click a chunk → it expands, shows chunk-level player
- [ ] Chunk player: play/pause within chunk bounds, rewind/FF clamped to chunk, loop within chunk
- [ ] Furigana show/hide toggle per chunk
- [ ] Keyboard shortcuts (space = play/pause, left/right = rewind/FF, L = loop toggle)

**Deliverable:** Fully functional audio player that syncs with the transcript.

---

### Milestone 5: Drill-Down (Lazy-Loaded Translations + Grammar)
**Goal:** Click "Drill-down" on a focused chunk to see sentence-by-sentence translation and grammar.

- [ ] Build Claude drill-down prompt — input: chunk text (Japanese),
  output: structured JSON with per-sentence English translation + grammar patterns
- [ ] `GET /api/chunks/[id]/drilldown` — check DB first, if missing → call Claude → store → return
- [ ] `POST /api/chunks/[id]/drilldown/regenerate` — re-call Claude, overwrite stored version
- [ ] Build drill-down UI component: expandable panel within focused chunk,
  shows sentence pairs + grammar cards
- [ ] Loading state while drill-down generates
- [ ] "Regenerate" button with confirmation

**Deliverable:** Full study workflow — listen to chunk, read Japanese, open drill-down for help.

---

### Milestone 6: Polish + UX
**Goal:** Make it feel like a real study tool, not a prototype.

- [ ] Podcast management: edit metadata, delete podcasts, optional cover art upload
  - Add `PATCH /api/podcasts/[id]` for podcast metadata updates
- [ ] Episode management: edit metadata, delete episodes
  - Add `PATCH /api/episodes/[id]` for editable episode fields
- [ ] Manual processing controls: retry failed jobs, re-run chunking/furigana, show last error clearly
  - Retry from the raw transcript if STT already succeeded
  - Retry the full pipeline only when needed
- [ ] Error handling throughout (API failures, timeouts, malformed responses)
- [ ] Responsive design (usable on phone for listening practice)
- [ ] Persist user preferences (furigana default on/off, playback speed)
- [ ] Visual design pass: typography for Japanese text (good font choices — Noto Sans JP + monospace for furigana)
- [ ] Auto-scroll to current chunk during global playback

**Deliverable:** A polished, daily-drivable study app.

---

### Milestone 7: Spaced Review System
**Goal:** Track learning progress and surface episodes for review at the right time.

- [ ] Add study status controls to episode page: "Start studying" / "Mark as learned"
- [ ] When marked "learned", compute `next_review` using simple spaced intervals
  (3 days → 1 week → 2 weeks → 1 month → 3 months)
- [ ] Build review dashboard (`/review`) — list of episodes due for review
- [ ] Review flow: user listens, then marks "comfortable" or "needs work"
  - Comfortable → advance to next interval
  - Needs work → reset to shorter interval, drop back to "studying"
- [ ] `POST /api/reviews` — log outcome, update `next_review` on episode
- [ ] Review history view: see past review outcomes for an episode
- [ ] Optional: per-chunk "needs work" flags that highlight trouble spots on revisits

**Deliverable:** A lightweight SRS loop — study episodes, mark learned, get reminded to revisit,
confirm retention or re-study. Focused on listening comprehension over rote memorization.

---

### Future: Nice-to-Haves (Unscheduled)

**Transcript normalization layer:**
Add a dedicated step between transcription and chunking that produces a study-friendly transcript while preserving the raw STT output as the source of truth.

Scope:
- Strip parenthetical non-speech metadata such as sound-effect labels
- Normalize obvious formatting noise and transcript artifacts
- Optionally convert certain high-confidence kana spellings into more natural kanji forms for reading study
- Keep this narrowly bounded to normalization, not freeform rewriting

Likely implementation notes:
- Add a `normalizing` episode status
- Store normalized transcript data separately from `raw_transcripts.payload`
- Prefer a hybrid approach: deterministic cleanup first, then an LLM pass for bounded orthography normalization if needed
- Add UI visibility so users can see whether an episode is transcribing, normalizing, or chunking

This is intentionally separated from the current furigana/chunking work because it touches the data model, processing flow, retry semantics, and UI states.

**Structure drilling (integrate existing japanese-drills app):**
Each grammar structure in a drilldown gets a "Drill this" button. Clicking it calls Claude
with the pattern (e.g. 〜てしまう) and asks it to generate a novel sentence using that structure.
The goal is to internalize the *pattern* rather than memorize the *specific sentence* from the podcast.
An existing standalone app already does this — first step is copy-paste integration, later a proper
merge. No schema changes needed; it's just a new API route (`POST /api/structures/drill`)
and a UI component within the drilldown panel.

**Multi-speaker support:**
Enable ElevenLabs `diarize: true`, add speaker name mapping to episodes, update chunking prompt
to respect speaker turns, show speaker labels in the UI. No architectural changes needed —
the data pipeline already supports it, just needs richer data flowing through.

---

## Hosting Costs

Everything except the API calls is free on Vercel's Hobby plan:

| Resource | Free Tier Limit | Your Usage | Notes |
|---|---|---|---|
| Vercel Postgres (Neon) | 256MB storage | Transcripts + metadata — well under limit | Would need thousands of episodes to approach |
| Vercel Blob | 500MB storage | ~30-50 episodes at 10-15MB each | First limit you'll hit; easy migration to Cloudflare R2 ($0.015/GB/mo) later |
| Serverless Functions | 60s timeout | ElevenLabs STT may be tight for 15-min files | Workaround: use ElevenLabs async/webhook mode; or upgrade to Pro ($20/mo) for 5-min timeout |
| Bandwidth | 100GB/mo | Single user, well under limit | |
| Deployments | Unlimited | | |

**Paid API costs (per episode, rough estimates for a 10-min episode):**
- ElevenLabs Scribe v2: ~$0.02-0.05
- Anthropic Claude (chunking + furigana): ~$0.01-0.03
- Anthropic Claude (drill-downs, lazy): ~$0.005 per chunk, only when requested

---

## Key Technical Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Database | Vercel Postgres (Neon) | Zero-config with Vercel, serverless, just Postgres |
| Audio storage | Vercel Blob | Simple, cheap, files are small (5-15MB) |
| ORM | Drizzle | Type-safe, lightweight, good Vercel Postgres support |
| Chunking | Claude API (post-transcription) | Semantic chunks > fixed-length for language learning |
| Furigana | Claude API (separate pass) | More reliable than rule-based; easy to re-run |
| Audio playback | Single `<audio>` element | Avoids complexity of slicing; use `currentTime` for chunk control |
| Background jobs | Polling (MVP) → Inngest (later) | Start simple, upgrade if needed |
| State management | React useState/useReducer | App is simple enough; no Redux/Zustand needed |

---

## Prompt Templates (Reference)

### Chunking Prompt
```
You are processing a Japanese transcript for a language learning app.

Split this transcript into chunks suitable for focused study.
Each chunk should:
- Contain 2-4 complete sentences
- Be a coherent thought or exchange
- Be under 150 characters when possible

The transcript has word-level timestamps. I'll provide the full text
and the word list. Return your chunks as a JSON array:

[
  {
    "text": "チャンクのテキスト",
    "first_word_index": 0,
    "last_word_index": 12
  }
]

Here is the transcript:
{full_text}

Here is the word list with indices:
{words_with_indices}
```

### Furigana Prompt
```
Add furigana readings to the kanji in this Japanese text.
Return the text using HTML <ruby> tags.
Only add readings to kanji — leave hiragana, katakana, and punctuation as-is.

Example:
Input: 日本語を勉強する
Output: <ruby>日本語<rt>にほんご</rt></ruby>を<ruby>勉強<rt>べんきょう</rt></ruby>する

Text: {chunk_text}
```

### Drill-Down Prompt
```
You are a Japanese language tutor. Analyze this Japanese text for
an intermediate learner.

For each sentence, provide:
1. The original Japanese
2. A natural English translation
3. Key grammar structures used, with:
   - The pattern name
   - A brief explanation
   - One additional example sentence

Return as JSON:
{
  "sentences": [
    {
      "japanese": "...",
      "english": "...",
      "structures": [
        {
          "pattern": "〜てしまう",
          "explanation": "Expresses that something has been done completely, often with regret",
          "example": { "ja": "食べてしまった", "en": "I ended up eating it all" }
        }
      ]
    }
  ]
}

Text: {chunk_text}
```
