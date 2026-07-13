---
name: offline-support
description: Use when working on offline downloads, the IndexedDB data layer, the download registry/orchestrator, the offline-snapshot endpoint, purging cached audio, or the offline badge/menu UI — "make episodes available offline", "why is a download stuck", changing the offline schemas, or testing against fake-indexeddb.
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
finishDownload       → complete             (bytesTotal, completedAt stamped)
failDownload(step)   → error                (step + message; prior progress retained)
```

- `ensureInitialized()` — lazy one-time IndexedDB load per page; safe to call
  from every mount effect. No-ops silently without IndexedDB (jsdom/SSR) and
  logs instead of throwing if the load fails.
- Cross-tab sync via `BroadcastChannel('kiku-downloads')`, feature-guarded.
- `removeDownload(episodeId)` = `deleteEpisodeData` **plus** a best-effort
  `caches.open('kiku-audio').delete('/api/episodes/<id>/audio', { ignoreSearch: true, ignoreVary: true })`
  — Cache Storage is accessible from page scope, not just the SW, so eviction
  is owned here (this is why the SW cache deliberately has no
  ExpirationPlugin). Guarded by `'caches' in globalThis`; a Cache Storage
  failure never blocks the IndexedDB cleanup.

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
