---
name: offline-support
description: Use when working on offline downloads, the IndexedDB data layer, the download registry/orchestrator, the offline-snapshot endpoint, purging cached audio, the offline badge/menu UI, or offline rendering/playback — "make episodes available offline", "why is a download stuck", the offline app-shell / `/offline` route, the SW navigation fallback, degrading actions offline, changing the offline schemas, or testing against fake-indexeddb.
---

# Offline support (M2 data layer + download flow)

Builds on the M1 service worker (see the CLAUDE.md "Service worker / PWA"
section): the SW caches audio (CacheFirst, cache `kiku-audio`) and study
guides (NetworkFirst) opportunistically; this layer makes downloads
**explicit** — episode data in IndexedDB, audio deliberately pulled into the
SW cache, and a registry the UI can subscribe to.

Everything lives under `src/lib/offline/`. All of it is client-side; nothing
here runs on the server except the snapshot endpoint.

## IndexedDB schema (`db.ts`, version in `constants.ts`)

Database `kiku-offline`, version `OFFLINE_DB_VERSION = 1`, opened via `idb`
with a typed schema. Four object stores:

| Store         | keyPath                        | Contents |
|---------------|--------------------------------|----------|
| `episodes`    | `episodeId`                    | episode meta + podcast slug/name |
| `segments`    | `[episodeId, segmentIndex]`    | full segment rows; index `by-episode` |
| `studyGuides` | `segmentId`                    | `{ segmentId, content }` (StudyGuideContent v2) |
| `downloads`   | `episodeId`                    | DownloadRecord (registry state) |

Bumping the schema = bump `OFFLINE_DB_VERSION` **and** extend the `upgrade()`
callback in `src/lib/offline/db.ts`.

## Zod boundary (`types.ts`, `store.ts`)

Every persisted shape has a Zod schema in `src/lib/offline/types.ts`
(`episodeSnapshotSchema`, `storedSegmentSchema`, `storedStudyGuideSchema`,
`downloadRecordSchema` — study-guide content reuses `studyGuideContentSchema`
from `src/lib/api/study-guide.ts`). The rule in `store.ts`:

- **Writes `.parse()`** — an invalid write throws; it means a caller bug.
- **Reads `.safeParse()`** — a corrupt/stale row (e.g. schema drift across app
  versions) is treated as **absent**, never thrown. The caller just
  re-downloads. Don't "fix" this by surfacing read errors.

`putEpisodeSnapshot` **fully replaces** the episode's stored segments: rows
whose `segmentIndex` is absent from the incoming snapshot are deleted in the
same transaction (re-segmentation can shrink an episode; without this,
`getEpisodeSnapshot` would return phantom tail segments from the earlier,
longer version).

`deleteEpisodeData(episodeId)` cascades across all four stores in one
transaction. It does **not** touch Cache Storage — use
`removeDownload` (below) for a full purge.

## Download registry (`downloadStore.ts`, `useDownloadRecord`)

Client singleton: in-memory `Map<episodeId, DownloadRecord>` mirroring the
`downloads` store, with subscribe/notify for `useSyncExternalStore`
(`src/hooks/useDownloadRecord.ts`; server snapshot is always `undefined` —
SSR renders "no record" and the truth arrives post-mount).

Record state machine (`status` × `step`):

```
startDownload        → downloading/guides   (progress counters zeroed)
updateProgress       → downloading/guides   (guidesCompleted/guidesTotal)
                     → downloading/audio    (audioBytes vs audioTotalBytes; total null = indeterminate)
finishDownload       → complete             (completedAt stamped; final size = audioBytes)
failDownload(step)   → error                (step + message; prior progress retained)
```

Progress-to-label derivation (percent math, "Guides n/m" / "Audio N%" /
indeterminate) is shared by the menu item and badge via
`src/lib/offline/progress.ts` — don't reimplement it per component.

**Why is a download "stuck"? — stale records.** If the tab closes mid-download,
the record stays `'downloading'` forever (nothing advances it). `isStale(record)`
detects this: status `'downloading'` and no progress write (`updatedAt`) for
more than `STALE_DOWNLOAD_MS` (60s, `constants.ts`; every progress tick writes
`updatedAt`, so a live download never trips it). Consumers must treat stale as
**restartable, not busy**: `useEpisodeDownload` derives
`isBusy = downloading && !isStale`, the menu shows "Retry download" ("Download
interrupted.") instead of the disabled progress chip, and the badge renders
nothing. Retrying resumes — stored guides and cached audio are skipped.

- `ensureInitialized()` — lazy one-time IndexedDB load per page; safe to call
  from every mount effect. No-ops silently without IndexedDB (jsdom/SSR) and
  logs instead of throwing if the load fails.
- Cross-tab sync via `BroadcastChannel('kiku-downloads')`, feature-guarded.
- `removeDownload(episodeId)` = `deleteEpisodeData` **plus** a best-effort
  `caches.open('kiku-audio').delete('/api/episodes/<id>/audio', { ignoreSearch: true, ignoreVary: true })`
  — Cache Storage is accessible from page scope, not just the SW, so eviction
  is owned here (this is why the SW cache deliberately has no
  ExpirationPlugin). Guarded by `'caches' in globalThis`; a Cache Storage
  failure never blocks the IndexedDB cleanup. **Intentional drift:** it does
  *not* purge the SW's `kiku-study-guides` NetworkFirst cache — that cache is
  an opportunistic bonus, IndexedDB is the authoritative guide store, and its
  entries are refreshed/overwritten by normal online reads. Don't "fix" this.

## Download orchestrator (`download.ts`, `downloadAudio.ts`, `concurrency.ts`)

`downloadEpisode({episodeId, title, podcastSlug, episodeNumber}, {onProgress})`:

1. `startDownload` record → GET `/api/episodes/[id]/offline-snapshot`,
   validate, `putEpisodeSnapshot`.
2. `navigator.storage.persist()` best-effort, once per page load (guarded;
   a `false`/throw never fails the download).
3. **Guides phase** — `mapWithConcurrency` (pure worker-pool helper in
   `concurrency.ts`) over segments, limit
   `STUDY_GUIDE_DOWNLOAD_CONCURRENCY = 3`; skips segments where
   `hasStudyGuide` is already true, otherwise GET
   `/api/segments/[id]/study-guide` (may lazily generate server-side — a
   paid Claude call per missing guide), validate, `putStudyGuide`, progress
   per completion.
4. **Audio phase** (`downloadAudio.ts`) — skip if `caches.match` already has
   it; else a **plain Range-less `fetch`** of `/api/episodes/[id]/audio` so
   the response is a full 200 that the SW's CacheFirst route captures —
   one Blob egress total. Byte progress via `response.body.getReader()`;
   `audioTotalBytes` is null without Content-Length.
5. `finishDownload`.

Per-phase try/catch → `failDownload(step, message)`; partial data is
retained. **Idempotent/resumable**: re-running skips stored guides and cached
audio, so "Retry download" after a failure only fetches what's missing.

**Re-entrancy guard:** a module-level in-flight set makes `downloadEpisode`
return `undefined` (doing nothing) when a download for the same episode is
already running in this tab — checked synchronously before the first await,
so rapid double-clicks can't start duplicate runs (which would re-pay Claude
guide generation and double the audio egress). Cross-tab duplicates are
handled a tick later by the registry's BroadcastChannel sync.

## Offline-snapshot endpoint

`GET /api/episodes/[id]/offline-snapshot`
(`src/app/api/episodes/[id]/offline-snapshot/route.ts`) — episode meta with
podcast slug/name resolved server-side (via `getEpisodeWithPodcast` in
`src/db/episodes.ts`) plus all segments, shaped to `episodeSnapshotSchema`.
400 invalid id / 404 missing / **409 unless status is `'ready'`** (mirrors
the processing-route guards). Standard envelope + colocated route tests per
the `add-api-route` skill.

## UI surfaces

- `src/hooks/useEpisodeDownload.ts` — `{record, isBusy, canStart, start, remove}`;
  `start` no-ops while offline (`useOnlineStatus`) or already downloading;
  orchestrator errors surface through the record, not throws.
- `src/components/EpisodeDownloadMenuItem.tsx` — action-menu item: "Make
  available offline" / progress label / "Retry download" (+ error text) /
  confirm-guarded "Remove download". Mounted by `EpisodeActionMenu` only when
  `podcastSlug` is passed.
- `src/components/EpisodeOfflineBadge.tsx` — chip on episode lists and the
  episode header: progress while downloading, "Offline" when complete,
  nothing otherwise (errors are the menu's job).

## Testing notes

- Unit tests import `'fake-indexeddb/auto'` (dev dependency) for a real
  in-memory IndexedDB. **Gotcha:** `indexedDB.deleteDatabase` blocks forever
  while a connection is open — await `resetOfflineDbForTests()` (closes the
  cached connection) before deleting the DB in `beforeEach`. See
  `src/lib/offline/__tests__/store.test.ts`.
- `caches`, `fetch`, `navigator.storage`, and `BroadcastChannel` are stubbed
  with `vi.stubGlobal` where needed; jsdom provides none of them.
- The SW only exists in production builds (`disable` in dev — M1), so the
  end-to-end audio-capture path (fetch → SW cache) **cannot be exercised in
  `next dev` or unit tests**; verify with a production build or trust the
  route-matcher tests in `src/lib/__tests__/sw-routes.test.ts`. Without the
  SW, downloads still work except audio isn't cached (the audio phase
  re-fetches next run).
- `AUDIO_CACHE_NAME` in `src/lib/offline/constants.ts` is the single source
  of truth; `src/app/sw.ts` imports it (verified the Serwist webpack build
  inlines it cleanly).

# M3 — offline rendering + playback

Makes the two study surfaces usable offline for **downloaded** episodes: the
episode page (transcript + range-loop playback) and the per-segment study page
(study guide + single-segment playback), all served from IndexedDB + the SW
audio cache. Online pages stay fully server-rendered and unchanged — offline is
a separate **client-only** path. Playback needs **zero** audio-engine changes:
the engine's plain full-file `fetch` is served from the SW's `kiku-audio`
CacheFirst cache transparently.

## The offline app-shell (`src/app/offline/page.tsx`)

A `'use client'` document with `export const dynamic = 'force-static'` and **no
server imports** (`@/db`, etc.). Its precached HTML + build-hashed chunks are
precached together and refreshed each deploy, so it can never reference purged
chunks (deploy-proof). It reads `window.location.pathname` **only in an
effect** (SSR/first render stays the loading state → hydration-safe), resolves
the route, loads from IndexedDB, and renders the same `EpisodePlayer` /
`StudyScreen` the online RSC pages use. On a matched route with no stored
episode/segment it shows an honest "not downloaded" empty state; off-pattern
routes get a generic "not available offline" state — never a crash or spinner.
The shell is also directly reachable **online** (bookmark/typed URL), so both
empty states read `useOnlineStatus()` and swap to online-appropriate copy
("Nothing to show here / … isn't part of the offline experience") instead of
falsely claiming the user is offline.

Data path (all pure/typed, no offline-specific rendering):
- `resolveOfflineRoute(pathname)` (`src/lib/offline/resolveOfflineRoute.ts`) —
  parses the two route patterns (`/podcasts/:slug/episodes/:number` and
  `…/segments/:segmentIndex/study`), validating episode number (positive int)
  and segment index (non-negative int); everything else is `'unsupported'`.
- `findEpisodeBySlugAndNumber(slug, number)` (`store.ts`) — linear scan of the
  `episodes` store (no new index; the count is tiny). Returns the parsed
  `StoredEpisodeMeta`, which carries **`id`** (== the `episodeId` keyPath, so
  the shell looks the snapshot up by `meta.id`).
- adapters in `src/lib/offline/offlineEpisode.ts` — `toPlayerSegments`,
  `buildEpisodePlayerProps`, `buildStudyScreenProps` turn an `EpisodeSnapshot`
  into the player/study props (audio + study-guide URLs, prev/next hrefs,
  durationMs-null → player's max-endMs fallback).
- `PlayerSegment` (`src/components/player/types.ts`) — the narrowed prop shape
  both the RSC page (full `Segment[]`) and the shell (IDB rows lacking
  `episodeId/createdAt/…`) satisfy without synthesizing fake columns.

## Study-guide offline reads (`src/lib/offline/studyGuideLoader.ts`)

`loadStudyGuideContent(segmentId, url, { isOnline })` — **IndexedDB is
authoritative for downloaded episodes.** Online: network-first (fresh
regenerations win) then IDB fallback. Offline: **IDB-first**, skipping the
doomed network attempt so we never eat the SW's 4s NetworkFirst timeout.
Returns `{ content, source: 'network' | 'cache' }`: a `'cache'` read *while
online* means a transient network failure served a possibly-stale saved copy
(the resilience tradeoff — prefer a saved guide over an error), and
`StudyScreen` shows a muted "Showing a saved copy — check your connection."
hint; a `'cache'` read while offline is expected and gets no hint.
`StudyScreen` passes `useOnlineStatus()` in and surfaces the
both-sources-miss throw as its error.

## Degraded affordances offline (gate = `useOnlineStatus()`)

Network-only controls disable with an "Unavailable offline" hint:
`EpisodeActionMenu` (start/stop studying, edit, delete — delete via the new
`disabled`/`disabledHint` props on `DeleteMenuItem`), `SegmentStatusControl`
(status `<select>`; M4 adds outbox queueing), `AddEpisodeButton`.
`EpisodeStatusPoller` doesn't spin against a dead network — it uses
`navigator.onLine` + `online`/`offline` listeners (not the hook, since its
polling effect has an empty dep array), shows a reconnect message while
offline, and resumes on `online`. `OfflineBanner` is wired into
`src/app/layout.tsx` so it shows app-wide while offline.

## SW navigation fallback (D1)

`OFFLINE_SHELL_URL = '/offline'` in `src/lib/offline/constants.ts` is the single
source of truth, imported by both `src/app/sw.ts` and `next.config.ts`.
- `src/app/sw.ts` adds a **NetworkOnly** runtime-caching route for same-origin
  navigations (`isNavigationRequest` from `src/lib/sw-routes.ts`: `request.mode
  === 'navigate'`). Online it's a plain pass-through (RSC/SSR unaffected);
  offline it errors, and the `fallbacks: { entries: [{ url: OFFLINE_SHELL_URL,
  matcher }] }` PrecacheFallbackPlugin serves the precached shell.
- `next.config.ts` precaches the shell via `additionalPrecacheEntries` with a
  build-scoped revision (`VERCEL_GIT_COMMIT_SHA ?? Date.now()`).
  **Gotcha:** `additionalPrecacheEntries` **replaces** @serwist/next's default
  public-folder scan, so `next.config.ts` replicates that scan (glob `public/**`,
  md5 revision per file, minus the generated `sw*`/`swe-worker*` outputs) —
  otherwise `public/soundtouch-processor.js` drops out of the precache and
  offline speed control breaks.
- In-app `<Link>` navigations offline fail their `?_rsc=` fetch; Next hard-nav's
  on failure → the SW catches the resulting document navigation → shell.

## Browser-only verification (SW is production-only)

The navigation fallback **cannot be unit-tested** (the SW only exists in a
production build). Verify against `npm run build && npm run start`: download an
episode online, go airplane-mode, reload the episode page → transcript renders
and play/seek/loop/range-loop/speed all work; open a segment study page (hard
nav) → guide (from IDB) + playback; confirm edit/delete/status/upload are
disabled and the poller isn't spinning; navigate to a non-downloaded episode →
honest empty state. Deploy-staleness: redeploy so chunk hashes change, go
offline, reload → still renders (shell + chunks re-precached together).
