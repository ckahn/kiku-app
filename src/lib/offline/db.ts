import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from './constants';
import type {
  DownloadRecord,
  EpisodeSnapshot,
  OutboxEntry,
  StoredSegment,
  StoredStudyGuide,
} from './types';

/**
 * Episode metadata as stored in the `episodes` object store — the
 * `episodeSnapshotSchema` "episode" shape plus the `episodeId` field the
 * store's keyPath needs (equal to `episode.id`; see store.ts).
 */
export type StoredEpisodeMeta = EpisodeSnapshot['episode'] & { readonly episodeId: number };

/**
 * A segment row as stored in the `segments` object store — a `StoredSegment`
 * plus the `episodeId` field its composite keyPath and `by-episode` index need.
 */
export type StoredSegmentRow = StoredSegment & { readonly episodeId: number };

interface OfflineDBSchema extends DBSchema {
  episodes: {
    key: number;
    value: StoredEpisodeMeta;
  };
  segments: {
    key: [number, number];
    value: StoredSegmentRow;
    // `by-id` is deliberately NON-unique: segment.id is a DB primary key and
    // unique in practice, but a `{ unique: true }` index build during the
    // versionchange transaction would abort the *entire* migration (bricking
    // offline data) if a duplicate ever existed. A non-unique index can't
    // abort; lookups just take the first matching key. See db.ts `upgrade`.
    indexes: { 'by-episode': number; 'by-id': number };
  };
  studyGuides: {
    key: number;
    value: StoredStudyGuide;
  };
  downloads: {
    key: number;
    value: DownloadRecord;
  };
  outbox: {
    key: string;
    value: OutboxEntry;
  };
}

export type OfflineDb = IDBPDatabase<OfflineDBSchema>;

let dbPromise: Promise<OfflineDb> | null = null;

/**
 * Open (or return the cached handle to) the offline IndexedDB database.
 * Idempotent within a page/worker lifetime — callers do not need to close it.
 */
export function openOfflineDb(): Promise<OfflineDb> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      // Guarded by `oldVersion` so this is correct both for a fresh install
      // (oldVersion 0 runs every block) and for a v1 -> v2 upgrade (only the
      // `< 2` block runs, leaving existing v1 rows untouched). `tx` is the
      // versionchange transaction; `createIndex` inside it re-indexes rows
      // already present in a store, so pre-existing segment rows get
      // indexed by `by-id` for free.
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('episodes', { keyPath: 'episodeId' });

          const segmentStore = db.createObjectStore('segments', {
            keyPath: ['episodeId', 'segmentIndex'],
          });
          segmentStore.createIndex('by-episode', 'episodeId');

          db.createObjectStore('studyGuides', { keyPath: 'segmentId' });
          db.createObjectStore('downloads', { keyPath: 'episodeId' });
        }

        if (oldVersion < 2) {
          tx.objectStore('segments').createIndex('by-id', 'id');
          db.createObjectStore('outbox', { keyPath: 'id' });
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Test-only escape hatch: closes the current connection (if one was opened)
 * and forces the next `openOfflineDb()` call to reopen a fresh one. Must be
 * awaited before deleting the underlying database in a test — IndexedDB's
 * `deleteDatabase` blocks forever while a connection is still open.
 */
export async function resetOfflineDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
}
