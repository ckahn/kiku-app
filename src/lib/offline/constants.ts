/**
 * Shared constants for the offline data layer (IndexedDB store + download
 * orchestrator). See the `offline-support` skill for the overall design.
 */

/** IndexedDB database name for offline episode data. */
export const OFFLINE_DB_NAME = 'kiku-offline';

/** IndexedDB schema version. Bump alongside a `db.ts` `upgrade()` change. */
export const OFFLINE_DB_VERSION = 1;

/**
 * Cache Storage cache name used by the service worker's audio CacheFirst route
 * (src/app/sw.ts) and by the download orchestrator/registry to purge a
 * removed episode's cached audio response. Single source of truth — sw.ts
 * imports this constant directly (verified the Serwist webpack bundling
 * tolerates the import cleanly: the built `public/sw.js` inlines the string
 * with no leaked Node-only deps).
 */
export const AUDIO_CACHE_NAME = 'kiku-audio';

/** Max concurrent study-guide fetches during an episode download. */
export const STUDY_GUIDE_DOWNLOAD_CONCURRENCY = 3;

/**
 * How long a 'downloading' record may go without a progress write before it
 * is considered stale (tab closed mid-download; nothing is advancing it).
 * `updatedAt` is written on every progress tick, so a healthy download stays
 * far inside this window even on slow connections.
 */
export const STALE_DOWNLOAD_MS = 60_000;
