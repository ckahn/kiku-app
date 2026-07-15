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

**If a change alters behavior described in `.claude/skills/` or this file, update the affected doc in the same commit.** A reference-consistency test (`src/test/skill-references.test.ts`) fails the suite when these docs cite files or skills that no longer exist, but it cannot catch descriptions that are merely outdated — that part is on you.

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
GET                   /api/episodes/[id]/offline-snapshot    — episode + podcast + segments, for offline download
GET                   /api/segments/[id]/study-guide         — lazy-generates if missing
POST                  /api/segments/[id]/study-guide/regenerate
PATCH                 /api/segments/[id]/study               — update single segment study status
GET                   /api/segments/random                   — random segment for active study sessions
POST                  /api/blob/upload                       — upload audio file to Vercel Blob
```

### Processing Pipeline

Upload → ElevenLabs STT → deterministic segmentation → kuromoji furigana → ready. Each step updates `episodes.status`. The pipeline is **client-driven**: `EpisodeStatusPoller` (rendered on the episode page while status is non-terminal) fires the transcribe POST, polls `/api/episodes/[id]`, and fires the segment POST when status reaches `'segmenting'`. There is no server-side queue or retry — if no page is open, processing does not advance. Both processing routes have status guards (409 unless the episode is in the expected state). Plan to upgrade to Inngest/Trigger.dev if needed. The poller does not spin against a dead network: while offline it shows a "will resume when you reconnect" message and starts polling on the `online` event.

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
/offline                                                   — client-only app-shell served by the SW for offline navigations (M3)
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

## Service worker / PWA (offline groundwork)

The service worker is built with [Serwist](https://serwist.pages.dev/) (`@serwist/next` + `serwist`, pinned to matching `9.5.11` versions). Source lives at `src/app/sw.ts`; for non-development builds, `next.config.ts` wraps the Next config in `withSerwistInit(...)` with `swSrc: "src/app/sw.ts"`, pointing the built output at the `public` folder as `sw.js`. Registration is auto-injected by `@serwist/next` — there is no manual register component.

**Turbopack incompatibility (empirical, Next 16.2.6):** Serwist's manifest injection is a webpack plugin. The default Turbopack builder refuses to build once this webpack config is present ("This build is using Turbopack, with a `webpack` config and no `turbopack` config"). `package.json`'s `build` script is therefore `next build --webpack`, not the Turbopack default. `vercel.json` pins Vercel's `buildCommand` to `npm run build` so deploys pick up the flag instead of the framework preset's bare `next build`.

**Local development vs local PWA testing:** `npm run dev` intentionally skips the Serwist wrapper entirely, so local app development stays on Next 16's default Turbopack dev server and no service worker is generated or registered. To exercise the production PWA path locally, run `npm run build` followed by `npm run start`, then test `http://localhost:3000` in the browser. That path uses webpack, emits the generated service worker under `public/`, injects the generated precache manifest, and allows the browser to register the service worker on localhost.

The built worker script and its sourcemap are generated at build time, not committed (gitignored, along with the alternate `swe-worker` output name), and excluded from both `tsconfig.json` and ESLint (`eslint.config.mjs` ignores the generated `sw*`/`swe-worker*` scripts under `public` — they're minified generated output, not source). `tsconfig.json` includes `"webworker"` in `lib` (alongside `dom`) and `"types": ["@serwist/next/typings"]` so `src/app/sw.ts` type-checks as a service worker; `sw.ts` declares `self` as `ServiceWorkerGlobalScope` locally to resolve the `dom`/`webworker` overlap.

**Manifest and icons:** `src/app/manifest.ts` is a Next metadata route (`MetadataRoute.Manifest`) served at `/manifest.webmanifest`; name/short_name "KIKU", `start_url: '/'`, `display: 'standalone'`, and `background_color`/`theme_color` matching the design tokens in `src/app/globals.css`. `public/icon-192.png`, `public/icon-512.png`, and a maskable `public/icon-512-maskable.png` (content scaled to 70% and centered, so it survives circular/squircle OS masking) are rasterized from `src/app/icon.svg`, the source of truth for the mark — regenerate with any SVG-to-PNG tool (e.g. `sharp-cli`) if the icon changes; there is no npm script for it since it's a one-off. `src/app/apple-icon.png` (180×180, flattened onto the manifest background color since iOS composites transparency on black) is a Next metadata file, auto-served with its `apple-touch-icon` link. `src/app/layout.tsx` sets `appleWebApp` metadata and a light/dark `viewport.themeColor`.

**Runtime caching:** `src/app/sw.ts`'s `runtimeCaching` array (route-matching predicates factored out into `src/lib/sw-routes.ts` for unit testing, since instantiating Serwist itself needs a real service worker global scope):
- Audio (`GET /api/episodes/<id>/audio`) — `CacheFirst`, cache name `kiku-audio`, restricted to full (200) responses via `CacheableResponsePlugin` (the route can also return 206 for byte-range requests; caching a partial response would corrupt offline playback since the Web Audio engine decodes the whole file once). Deliberately has **no** `ExpirationPlugin` — the cache is unbounded on purpose; M2's download registry will own eviction, and an LRU cap here would silently evict episodes a user explicitly downloaded.
- Study guides (`GET /api/segments/<id>/study-guide`, exact — does not match its own `/regenerate` sub-route) — `NetworkFirst` with a ~4s `networkTimeoutSeconds`, cache name `kiku-study-guides`.
- Navigations (same-origin, `request.mode === 'navigate'` via `isNavigationRequest` in `src/lib/sw-routes.ts`) — `NetworkOnly`. Online this is a plain pass-through (RSC/SSR unaffected); offline it errors and the Serwist `fallbacks` PrecacheFallbackPlugin serves the precached `/offline` shell (M3, below).
- `public/soundtouch-processor.js` and the other `public/` assets are precached via `next.config.ts`'s `additionalPrecacheEntries` (M3). That option **replaces** @serwist/next's default public-folder scan, so `next.config.ts` replicates the scan (glob `public/**`, md5 revision per file, minus the generated `sw*`/`swe-worker*` outputs) and appends the `/offline` shell entry — dropping the scan would evict the soundtouch worklet and break offline speed control.

**Client-side primitives:** `useOnlineStatus` (`src/hooks/useOnlineStatus.ts`) and `OfflineBanner` (`src/components/OfflineBanner.tsx`); M3 wires `OfflineBanner` into `src/app/layout.tsx` (shown app-wide while offline) and gates network-only controls on `useOnlineStatus` (below).

### Offline data layer (M2)

Explicit episode downloads on top of the M1 service worker. Everything lives in `src/lib/offline/` — see the `offline-support` skill for the full design; summary:

- **IndexedDB** (`kiku-offline`, via `idb`): stores `episodes`, `segments` (composite key `[episodeId, segmentIndex]`, index `by-episode`), `studyGuides`, `downloads`. Zod-validated boundary in `store.ts`: writes `parse` (throw), reads `safeParse` (corrupt row = treated as missing). `deleteEpisodeData` cascades all four stores in one transaction.
- **Download registry** (`downloadStore.ts` + `useDownloadRecord`): client singleton, in-memory Map + subscribe/notify over `useSyncExternalStore`, records persisted to the `downloads` store, cross-tab sync via `BroadcastChannel('kiku-downloads')`. `removeDownload` also purges the episode's audio from the `kiku-audio` Cache Storage cache — eviction is owned here, which is why the SW audio cache has no ExpirationPlugin.
- **Orchestrator** (`download.ts`): snapshot → guides (bounded to `STUDY_GUIDE_DOWNLOAD_CONCURRENCY = 3` concurrent study-guide fetches; each missing guide is a paid lazy generation) → audio (plain Range-less fetch captured by the SW CacheFirst route — single Blob egress; progress via stream reader). Per-phase failure marks the record `error` at that step with partials retained; re-running resumes (skips stored guides / cached audio). `navigator.storage.persist()` requested best-effort on first download.
- **Endpoint**: `GET /api/episodes/[id]/offline-snapshot` — episode + podcast slug/name (server-resolved) + segments in one call; 409 unless `ready`.
- **UI**: `useEpisodeDownload` → `EpisodeDownloadMenuItem` in `EpisodeActionMenu` (start/progress/retry/remove; start disabled offline) and `EpisodeOfflineBadge` on episode lists + episode header (progress chip → "Offline" chip; SSR-safe, renders nothing on the server).
- **Testing**: unit tests use `fake-indexeddb/auto`; the SW is production-only, so the fetch→SW-cache audio capture can't be exercised in dev/unit tests.

### Offline rendering + playback (M3)

Downloaded episodes are usable with no network; online pages stay fully RSC and unchanged (offline is a separate client path, so zero regression surface). Playback needs **zero** audio-engine changes — the engine's full-file `fetch` is served from the SW `kiku-audio` cache. See the `offline-support` skill for the full design; summary:

- **Offline app-shell** (`src/app/offline/page.tsx`): a `'use client'`, `dynamic = 'force-static'` document with no server imports, served by the SW for offline navigations. It reads `window.location.pathname` in an effect, resolves the route (`resolveOfflineRoute` in `src/lib/offline/resolveOfflineRoute.ts`), looks up the episode (`findEpisodeBySlugAndNumber` in `store.ts`, then `getEpisodeSnapshot`), and renders the same `EpisodePlayer` / `StudyScreen` the online pages use. `/` resolves to a downloaded-episodes home list (complete registry records, newest first, plain `<a>` links so navigation re-enters the shell offline). Honest empty states for not-downloaded / off-pattern routes / an empty download list — never a crash or spinner.
- **Prop adapters** (`src/lib/offline/offlineEpisode.ts`): pure `EpisodeSnapshot` → player/study props. `EpisodePlayer` accepts a narrowed `PlayerSegment` (`src/components/player/types.ts`) so IDB rows satisfy it without fake `episodeId/createdAt` columns.
- **Study-guide reads** (`src/lib/offline/studyGuideLoader.ts`): IndexedDB is authoritative for downloaded episodes. Online = network-first then IDB fallback; offline = IDB-first (skips the doomed fetch). `StudyScreen` passes `useOnlineStatus()` in.
- **Degraded affordances** (gate = `useOnlineStatus()`): `EpisodeActionMenu`'s edit/delete and `AddEpisodeButton` disable offline with a hint; `EpisodeStatusPoller` stops polling offline (uses `navigator.onLine` + `online`/`offline` events) and resumes on reconnect. `SegmentStatusControl` and `EpisodeActionMenu`'s study toggle no longer disable offline as of M4 (below) — they queue instead.
- **SW navigation fallback**: `OFFLINE_SHELL_URL = '/offline'` (`src/lib/offline/constants.ts`) is imported by `src/app/sw.ts` (NetworkOnly navigation route + Serwist `fallbacks`) and `next.config.ts` (`additionalPrecacheEntries`). SW end-to-end is production-only — verify in the browser under airplane mode (protocol in the `offline-support` skill).

### Offline mutations + sync (M4)

Study-status changes (the only mutations that queue — edit, delete, regenerate, and upload stay online-only) work offline: `SegmentStatusControl` and `EpisodeActionMenu`'s study toggle route through `mutateWithOutbox` (`src/lib/offline/mutateWithOutbox.ts`) instead of a raw `fetch`, and no longer disable offline. See the `offline-support` skill (M4 section) for the full design; summary:

- **IndexedDB bumped to v2** (`OFFLINE_DB_VERSION` in `src/lib/offline/constants.ts`): a new `outbox` store plus a non-unique `by-id` index on `segments` (so a row can be found by its DB id, not just `[episodeId, segmentIndex]`). The `db.ts` `upgrade()` is guarded by `oldVersion` so v1 installs migrate in place.
- **`outboxStore.ts`** — a `downloadStore`-style client singleton: enqueue coalesces per-target (last-write-wins), a `replaying` guard prevents double-drains, and FIFO `replay()` runs on the `online` event (installed by `ensureOutboxInitialized`, also mounted app-wide via `PendingChangesIndicator` in `src/app/layout.tsx`).
- **`mutateWithOutbox`** — online success PATCHes through and clears any stale queued entry for the target; online permanent (4xx) failure throws (surfaced, not queued); everything else attempts an optimistic IndexedDB write and only queues if the row existed (episode downloaded) — otherwise throws so the caller rolls back.
- **No Background Sync API** (deliberate scope cut — replay only runs while the app is open) and **no server-side stale-replay guard** (`clientTimestamp` is client-only; single-user app, so cross-device staleness can't occur).

## Key Design Decisions

- Drizzle ORM (not Prisma) — lightweight, type-safe, good Vercel Postgres support
- Deterministic segmentation + kuromoji furigana replaced the original Claude calls (free, fast, reproducible); the Claude branches remain as switchable fallbacks via the strategy constants
- Web Audio decode-once engine replaced the `<audio>` element to cut Vercel Blob egress (seeks and loops are in-memory, not new range requests)
- Study guides are lazy-generated and stored; regenerate = `UPDATE` in place (one row per segment, `UNIQUE(segment_id)`); `STUDY_GUIDE_CURRENT_VERSION` bumps invalidate the cache
- Raw ElevenLabs transcript stored in `raw_transcripts.payload` (JSONB) to allow reprocessing without re-calling the API
- Furigana stored as HTML (`<ruby>` tags) in `segments.text_furigana`, not computed client-side
- Claude model IDs are centralized in `src/lib/constants.ts` — update them there when switching models
