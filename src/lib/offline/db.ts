import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from './constants';
import type { DownloadRecord, EpisodeSnapshot, StoredSegment, StoredStudyGuide } from './types';

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
    indexes: { 'by-episode': number };
  };
  studyGuides: {
    key: number;
    value: StoredStudyGuide;
  };
  downloads: {
    key: number;
    value: DownloadRecord;
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
      upgrade(db) {
        db.createObjectStore('episodes', { keyPath: 'episodeId' });

        const segmentStore = db.createObjectStore('segments', {
          keyPath: ['episodeId', 'segmentIndex'],
        });
        segmentStore.createIndex('by-episode', 'episodeId');

        db.createObjectStore('studyGuides', { keyPath: 'segmentId' });
        db.createObjectStore('downloads', { keyPath: 'episodeId' });
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
