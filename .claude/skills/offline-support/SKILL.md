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

Database `kiku-offline`, version `OFFLINE_DB_VERSION = 2` (bumped in M4 — see
below), opened via `idb` with a typed schema. Five object stores:

| Store         | keyPath                        | Contents |
|---------------|--------------------------------|----------|
| `episodes`    | `episodeId`                    | episode meta + podcast slug/name |
| `segments`    | `[episodeId, segmentIndex]`    | full segment rows; indexes `by-episode`, `by-id` (M4, non-unique) |
| `studyGuides` | `segmentId`                    | `{ segmentId, content }` (StudyGuideContent v2) |
| `downloads`   | `episodeId`                    | DownloadRecord (registry state) |
| `outbox`      | `id` (`` `${kind}:${targetId}` ``) | OutboxEntry — queued offline study-status mutation (M4) |

Bumping the schema = bump `OFFLINE_DB_VERSION` **and** extend the `upgrade()`
callback in `src/lib/offline/db.ts`, guarded by `oldVersion` so it's correct
for both a fresh install and an upgrade from an earlier version (see M4's
migration below for the pattern).

`openOfflineDb` also wires the idb `blocked`/`blocking` handlers: `blocked`
(an older tab's connection is preventing this open's upgrade) logs a
diagnostic instead of hanging silently, and `blocking` (a newer tab wants to
upgrade past this connection's version) closes this connection and nulls the
cached promise so the newer tab can proceed and a later call here reopens.
Without `blocking`, a v(N) connection held open in one tab would make every
other tab's v(N+1) upgrade hang forever.

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

`deleteEpisodeData(episodeId)` cascades across all five stores in one
transaction — including the episode's queued `outbox` entries (the
episode-status entry plus one segment-status entry per segment row), so a
removed download's pending study-status changes can't replay against the
server after the data they came from is gone (M4). It does **not** touch
Cache Storage — use `removeDownload` (below) for a full purge;
`removeDownload` also re-syncs the outbox singleton's in-memory mirror
(`syncAfterExternalChange`) so the pending-changes indicator drops the
purged entries immediately.

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
`EpisodeActionMenu` (edit, delete — delete via the `disabled`/`disabledHint`
props on `DeleteMenuItem`), `AddEpisodeButton`. `SegmentStatusControl` and
`EpisodeActionMenu`'s start/stop-studying item **no longer disable offline as
of M4** (below) — they queue instead. `EpisodeStatusPoller` doesn't spin
against a dead network — it uses
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
nav) → guide (from IDB) + playback; confirm edit/delete/upload are disabled,
study-status changes queue (M4, below), and the poller isn't spinning;
navigate to a non-downloaded episode → honest empty state. Deploy-staleness:
redeploy so chunk hashes change, go offline, reload → still renders (shell +
chunks re-precached together).

## Offline home list (added to M3 during on-device testing)

Navigating to `/` offline resolves to `{ kind: 'home' }` in `resolveOfflineRoute` and the shell renders a "Downloaded episodes" list from `getAllDownloadRecords()` (status `complete` only, newest `completedAt` first). List items are plain `<a>` links (hard navigation → re-enters the shell offline). Empty list renders an online/offline-aware empty state.

# M4 — Offline mutations + sync

Makes **study-status changes** work offline — the only mutations that queue;
edit, delete, regenerate, and upload remain online-only exactly as M3 left
them. `SegmentStatusControl` and `EpisodeActionMenu`'s study toggle route
through a shared helper instead of a raw `fetch`, and no longer disable
offline.

## IndexedDB v1 → v2 migration (`db.ts`, `constants.ts`)

`OFFLINE_DB_VERSION` bumped to `2`. The upgrade adds a non-unique `by-id`
index on `segments` (needed because `SegmentStatusControl` only knows the
segment's DB id, not its `[episodeId, segmentIndex]` composite key) and a new
`outbox` object store (keyPath `id`). The `upgrade(db, oldVersion, _newVersion, tx)`
callback is guarded by `oldVersion` so it's correct both for a fresh install
(`oldVersion < 1` block runs) and an existing v1 database upgrading in place
(`oldVersion < 1` is skipped, only the `< 2` block runs — existing rows
survive untouched). `tx` is the `versionchange` transaction; `createIndex`
inside it re-indexes rows already present in a store, so pre-existing segment
rows get indexed by `by-id` for free without a manual backfill.

**`by-id` is deliberately non-unique.** Although `segment.id` is a DB primary
key and unique in practice, a `{ unique: true }` index build during the
versionchange transaction would **abort the entire migration** if a duplicate
ever existed — bricking a user's offline data. A non-unique index cannot
abort; lookups just take the first matching key. Covered by a migration
survival test in `store.test.ts` that hand-opens a v1-shaped database, writes
rows, then opens via the real (v2) `openOfflineDb()` and asserts the rows
and the new index/store all exist.

## Outbox entry shape + coalescing (`types.ts`)

```ts
type OutboxKind = 'segment-status' | 'episode-status';
interface OutboxEntry {
  id: string;            // `${kind}:${targetId}` -- the coalescing key
  kind: OutboxKind;
  targetId: number;      // segmentId (segment-status) or episodeId (episode-status)
  status: StudyStatus;
  clientTimestamp: number;
}
```

`url`/`method`/`body` are **not stored** — they're derived at replay time by
`toReplayRequest` (`outboxReplay.ts`) so a future route rename can't strand
already-queued entries with a stale URL. `id` is the coalescing key:
`putOutboxEntry` overwrites on repeat writes to the same target, so
repeatedly flipping one segment's status offline leaves exactly one queued
entry carrying the latest status (last-write-wins). `outboxEntryId(kind,
targetId)` is the single source of truth for deriving this key — both
`outboxStore.enqueue` and `mutateWithOutbox` (to clear a stale entry on a
fresh online success) use it.

`clientTimestamp` is used **client-side only**, for FIFO replay ordering and
as the coalesced entry's timestamp. There is no server-side stale-replay
guard on the two PATCH routes — the offline queue is inherently single-device
(single-user app), so the one scenario a server timestamp would guard
against (the same target changed on another device between enqueue and
replay) can't occur. This is the natural extension point if multi-device
ever lands.

## `outboxStore.ts` — client singleton + FIFO replay

Modeled directly on `downloadStore.ts`: an in-memory `Map<id, OutboxEntry>`
mirroring the `outbox` store, `subscribe`/`notify` for `useSyncExternalStore`
(`src/hooks/useOutbox.ts`), `BroadcastChannel('kiku-outbox')` cross-tab sync,
and `ensureOutboxInitialized()` — a lazy one-time load that also **installs
the single `window.addEventListener('online', …)` listener**, **opens the
BroadcastChannel eagerly** (a passive tab that never writes locally must
still hear other tabs' outbox changes, or it would hold a stale mirror), and,
if the queue is non-empty and the browser is already online at init time,
kicks one replay immediately (drains a queue left behind by a session that
closed before reconnecting).

`syncAfterExternalChange()` re-syncs the mirror after another module changed
the outbox IDB store directly (currently: `removeDownload` after
`deleteEpisodeData`'s cascade) and pings other tabs. Plain `refresh()`
deliberately does not broadcast — the channel receiver calls it, so
broadcasting from inside it would ping-pong between tabs.

**`getStateSnapshot()` returns a memoized `{ count, error }` object**,
rebuilt only inside `notify()` — never fresh on every call. This is required
for `useSyncExternalStore`: a snapshot getter that allocates a new object on
every call makes React think the store changed on every render, causing an
infinite re-render loop. Mirror this pattern for any future singleton that
exposes more than a single scalar to `useSyncExternalStore`.

`replay()` drains the queue in FIFO order by `clientTimestamp`, PATCHing each
entry's derived request:
- success → delete the entry, continue.
- **permanent** failure (`>= 400 && < 500`, excluding `408`/`429`) → the
  mutation is invalid or its target is gone (e.g. 404 — segment deleted
  server-side); drop the entry and set a user-visible error.
- **transient** failure (network throw, `5xx`, `408`, `429`) → keep the
  entry and **stop the loop immediately** — later entries are left alone so
  FIFO ordering (and therefore last-write-wins) holds for the next attempt;
  skipping ahead would let a later entry replay out of order.

The in-flight drain is retained as a module-level **promise** (not a boolean
flag): overlapping `online` events join the single in-flight drain,
`ensureOutboxInitialized`'s fire-and-forget kick can be awaited
deterministically in tests via `replay()`, and the write-lock coordination
below can wait on it.

**Same-tab replay/write coordination** (`withTargetWriteLock`): a fresh
online write from `mutateWithOutbox` and a replay of that target's queued
(older) value can otherwise race — two PATCHes for the same target in
flight, with the older value able to land last. `withTargetWriteLock(id, fn)`
waits for an in-flight drain that still holds the target before running the
write, and registers the target as being written so a drain that starts
mid-write **skips** that entry (the write supersedes it and clears it on
success). This is deliberately same-tab only: cross-tab duplication is not
coordinated, and its worst case — the same idempotent status-set PATCH sent
twice — is accepted-safe.

## `mutateWithOutbox` — the shared decision point (`mutateWithOutbox.ts`)

```ts
interface MutateInput {
  kind: OutboxKind; targetId: number; status: StudyStatus; isOnline: boolean;
}
type MutateResult = { outcome: 'synced' } | { outcome: 'queued' };
```

1. **Online**: PATCH the derived request, inside `withTargetWriteLock` (see
   the replay/write coordination above).
   - success → best-effort refresh the stored snapshot row(s) (D4: a
     downloaded episode's IDB copy shouldn't drift stale after an online
     edit — a refresh failure is logged via `console.error`, not surfaced,
     since the mutation already succeeded server-side), clear any stale
     coalesced outbox entry for this target (edge case: a queued change made
     offline earlier must not later revert a fresh online write), return
     `synced`.
   - **permanent** failure → throw the parsed response error (a real
     validation error — surface it, don't queue).
   - **transient** failure or a network throw → fall through to step 2.
2. **Offline** (or the transient fallthrough from step 1): attempt the
   optimistic IndexedDB write — `updateStoredSegmentStudyStatus` (locates the
   row via the `by-id` index) for `segment-status`, or
   `setStoredEpisodeSegmentsStudyStatus` (cascades to every stored segment
   row for the episode, mirroring the server route) for `episode-status`.
   - a row existed (episode is downloaded) → enqueue the coalesced entry,
     return `queued`.
   - no row existed (episode was never downloaded) → **throw** instead of
     silently no-op'ing. This is the one honesty-preserving edge case: the
     two controls only render inside the offline shell for downloaded
     episodes, so in practice this throw path is defensive (e.g. an RSC list
     page loaded online that then lost connectivity for a non-downloaded
     episode) — but it's what keeps M3's "not usable offline" guarantee
     intact rather than silently pretending an unqueueable change succeeded.

## UI wiring

`SegmentStatusControl` and `EpisodeActionMenu`'s study-toggle button call
`mutateWithOutbox` instead of a raw `fetch`, and dropped `!isOnline` from
their `disabled` (edit/delete/download stay gated exactly as M3 left them).
On `synced`, the existing `router.refresh()` still runs. On `queued`,
`router.refresh()` is skipped (there's no server to re-derive from, and the
offline shell has no RSC to refresh anyway) and the optimistic value is
kept: `SegmentStatusControl` shows a muted "Saved — will sync when online"
hint; `EpisodeActionMenu` gives brief feedback via its existing
`alert(...)`-based pattern. On a thrown error, both roll back to the
previous value through their existing error paths (`role="alert"` /
`alert(...)`).

Both components keep a **local optimistic mirror** of the study status
(`useState` initialized from the prop, `useEffect` resync on prop change).
For `EpisodeActionMenu` this is load-bearing, not cosmetic: its
`studyStatus` prop is server-derived, so after a queued offline toggle (no
refresh) the prop goes stale — without the mirror, the menu label wouldn't
flip and a second offline tap would re-send the SAME direction instead of
reversing it.

## `PendingChangesIndicator` (`src/components/PendingChangesIndicator.tsx`)

A dedicated component (not folded into `OfflineBanner` — connectivity and
sync-queue state are different concerns that can co-occur, e.g. back online
with a queue still draining) reading `useOutboxState()`
(`src/hooks/useOutbox.ts`, a `useSyncExternalStore` wrapper over
`outboxStore`): renders nothing at `count === 0 && !error`, "N change(s)
waiting to sync" once entries are queued, and the permanent-replay-failure
error text otherwise. Mounted in `src/app/layout.tsx` next to `OfflineBanner`
so it appears app-wide, including on the offline shell. Mounting the hook is
what triggers `ensureOutboxInitialized()` — the `online` listener and initial
drain — so the indicator being mounted app-wide is also what keeps the
replay engine armed.

Two actions (both 44px touch targets with pointer cursor): **"Retry now"**
(shown while `count > 0`) calls `outboxStore.retry()` — a manual drain,
because a transient failure hit while genuinely online never gets an
`online` event to retry it; and a **dismiss** control (shown with an error)
calls `outboxStore.acknowledgeError()` — the sticky permanent-failure error
otherwise only clears on a later successful replay, which may never come if
the queue is already empty.

## No Background Sync API (deliberate scope cut)

Background Sync would need a service-worker `sync` event, page↔SW message
plumbing, and either duplicating the replay logic inside the SW or giving the
SW IndexedDB access — a large complexity increase for a single-user app
whose queued mutations are study-status flips, not latency-critical writes.
`online`-event replay while the app is open (plus the initial-load drain in
`ensureOutboxInitialized`) covers the realistic reconnect-with-app-foreground
case. Not scheduled; recorded here as the natural next step if replay while
fully closed ever becomes a requirement.

## Testing notes (M4)

- `store.test.ts` — outbox CRUD + `.safeParse` drop of a corrupt row,
  `updateStoredSegmentStudyStatus` / `setStoredEpisodeSegmentsStudyStatus`,
  and the v1→v2 migration-survival test (hand-built v1 `openDB`, write rows,
  reopen via the real v2 path, assert survival + new index/store).
- `outboxReplay.test.ts` — pure mapper + `isPermanentReplayFailure` boundary
  table (399/400/404/408/429/499/500/503).
- `outboxStore.test.ts` (jsdom, `fake-indexeddb`, stubbed `fetch`) —
  coalescing, snapshot referential stability, FIFO replay ordering, all three
  failure modes, the shared in-flight drain, `withTargetWriteLock`
  coordination (both directions), the eager BroadcastChannel, and
  `online`-event-triggered drain.
- `mutateWithOutbox.test.ts` (jsdom, `fake-indexeddb`, stubbed `fetch`) — all
  six branches (synced / stale-entry-cleared / offline-queued /
  offline-not-downloaded-throws / online-transient-queued /
  online-permanent-throws).
- Component tests mock `@/lib/offline/mutateWithOutbox` directly rather than
  stubbing `fetch` — the components' job is to call the helper with the
  right arguments and react to its result/throw, not to reimplement its
  online/offline branching.
- **Browser-only**: airplane-mode → change a segment's status on a
  downloaded episode → sticks, indicator shows "1 change waiting to sync",
  reload offline → status persisted from IDB; flip the same segment multiple
  times offline → still one queued change (coalesced); reconnect → queue
  drains, indicator clears, server reflects the final status; a
  non-downloaded episode's study toggle offline → errors, nothing queued.
