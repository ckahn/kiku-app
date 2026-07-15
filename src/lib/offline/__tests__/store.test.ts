import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';
import { OFFLINE_DB_NAME } from '../constants';
import { openOfflineDb, resetOfflineDbForTests } from '../db';
import {
  deleteEpisodeData,
  deleteOutboxEntry,
  findEpisodeBySlugAndNumber,
  getAllDownloadRecords,
  getAllOutboxEntries,
  getDownloadRecord,
  getEpisodeSnapshot,
  getStudyGuide,
  hasStudyGuide,
  putDownloadRecord,
  putEpisodeSnapshot,
  putOutboxEntry,
  putStudyGuide,
  setStoredEpisodeSegmentsStudyStatus,
  updateStoredSegmentStudyStatus,
} from '../store';
import type { DownloadRecord, EpisodeSnapshot, OutboxEntry, StoredStudyGuide } from '../types';

function makeSnapshot(overrides: Partial<EpisodeSnapshot['episode']> = {}): EpisodeSnapshot {
  return {
    episode: {
      id: 1,
      title: 'Episode One',
      episodeNumber: 1,
      durationMs: 60_000,
      podcastSlug: 'my-podcast',
      podcastName: 'My Podcast',
      ...overrides,
    },
    segments: [
      {
        id: 101,
        segmentIndex: 0,
        textRaw: '今日はいい天気です。',
        textFurigana: '<ruby>今日<rt>きょう</rt></ruby>はいい天気です。',
        furiganaStatus: 'ok',
        furiganaWarning: null,
        startMs: 0,
        endMs: 3000,
        studyStatus: 'new',
        sentences: [{ text: '今日はいい天気です。', start_ms: 0, end_ms: 3000 }],
      },
      {
        id: 102,
        segmentIndex: 1,
        textRaw: '散歩に行きましょう。',
        textFurigana: '散歩に行きましょう。',
        furiganaStatus: 'ok',
        furiganaWarning: null,
        startMs: 3000,
        endMs: 6000,
        studyStatus: 'new',
        sentences: [{ text: '散歩に行きましょう。', start_ms: 3000, end_ms: 6000 }],
      },
    ],
  };
}

function makeDownloadRecord(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    episodeId: 1,
    status: 'downloading',
    step: 'guides',
    guidesCompleted: 0,
    guidesTotal: 2,
    audioBytes: 0,
    audioTotalBytes: null,
    title: 'Episode One',
    podcastSlug: 'my-podcast',
    episodeNumber: 1,
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  await resetOfflineDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('kiku-offline');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe('episode snapshot round-trip', () => {
  it('stores and retrieves a full snapshot in segment order', async () => {
    const snapshot = makeSnapshot();
    await putEpisodeSnapshot(snapshot);

    const result = await getEpisodeSnapshot(1);

    expect(result).toEqual(snapshot);
  });

  it('returns null for an episode that was never downloaded', async () => {
    const result = await getEpisodeSnapshot(999);
    expect(result).toBeNull();
  });

  it('upserts on a second write, replacing prior segments', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    const updated = makeSnapshot({ title: 'Episode One (updated)' });
    await putEpisodeSnapshot(updated);

    const result = await getEpisodeSnapshot(1);
    expect(result?.episode.title).toBe('Episode One (updated)');
    expect(result?.segments).toHaveLength(2);
  });

  it('deletes segments absent from a re-downloaded, shorter snapshot', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    const shrunk: EpisodeSnapshot = {
      ...makeSnapshot(),
      segments: [makeSnapshot().segments[0]],
    };
    await putEpisodeSnapshot(shrunk);

    const result = await getEpisodeSnapshot(1);
    expect(result?.segments).toHaveLength(1);
    expect(result?.segments[0].segmentIndex).toBe(0);
  });

  it('does not delete another episode segments when replacing a snapshot', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    await putEpisodeSnapshot(makeSnapshot({ id: 2, title: 'Episode Two' }));

    const shrunk: EpisodeSnapshot = {
      ...makeSnapshot(),
      segments: [makeSnapshot().segments[0]],
    };
    await putEpisodeSnapshot(shrunk);

    const other = await getEpisodeSnapshot(2);
    expect(other?.segments).toHaveLength(2);
  });

  it('rejects an invalid write', async () => {
    const invalid = {
      ...makeSnapshot(),
      segments: [{ ...makeSnapshot().segments[0], furiganaStatus: 'bogus' }],
    };

    await expect(putEpisodeSnapshot(invalid as unknown as EpisodeSnapshot)).rejects.toThrow();
  });

  it('drops a corrupt row on read instead of throwing', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    // Directly corrupt the underlying IndexedDB row, bypassing the Zod boundary.
    const dbRequest = indexedDB.open('kiku-offline');
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      dbRequest.onsuccess = () => resolve(dbRequest.result);
      dbRequest.onerror = () => reject(dbRequest.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('episodes', 'readwrite');
      tx.objectStore('episodes').put({ episodeId: 1, id: 1, title: 'broken' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const result = await getEpisodeSnapshot(1);
    expect(result).toBeNull();
  });
});

describe('study guide round-trip', () => {
  const record: StoredStudyGuide = { segmentId: 101, content: studyGuideFixture as never };

  it('stores and retrieves a study guide', async () => {
    await putStudyGuide(record);
    const result = await getStudyGuide(101);
    expect(result).toEqual(record);
  });

  it('hasStudyGuide reflects presence', async () => {
    expect(await hasStudyGuide(101)).toBe(false);
    await putStudyGuide(record);
    expect(await hasStudyGuide(101)).toBe(true);
  });

  it('returns null for a missing study guide', async () => {
    expect(await getStudyGuide(999)).toBeNull();
  });

  it('upserts on a second write', async () => {
    await putStudyGuide(record);
    const updated: StoredStudyGuide = {
      segmentId: 101,
      content: { ...(studyGuideFixture as never), version: 2 },
    };
    await putStudyGuide(updated);

    const result = await getStudyGuide(101);
    expect(result).toEqual(updated);
  });

  it('rejects an invalid write', async () => {
    const invalid = { segmentId: 101, content: { version: 2 } };
    await expect(putStudyGuide(invalid as unknown as StoredStudyGuide)).rejects.toThrow();
  });

  it('drops a corrupt row on read instead of throwing', async () => {
    const db = await openOfflineDb();
    await db.put('studyGuides', { segmentId: 101, content: { version: 2 } } as never);

    expect(await getStudyGuide(101)).toBeNull();
  });
});

describe('download record round-trip', () => {
  it('stores and retrieves a download record', async () => {
    const record = makeDownloadRecord();
    await putDownloadRecord(record);
    expect(await getDownloadRecord(1)).toEqual(record);
  });

  it('returns null for a missing download record', async () => {
    expect(await getDownloadRecord(999)).toBeNull();
  });

  it('upserts progress on repeated writes', async () => {
    await putDownloadRecord(makeDownloadRecord({ guidesCompleted: 0 }));
    await putDownloadRecord(makeDownloadRecord({ guidesCompleted: 2, updatedAt: Date.now() + 1 }));

    const result = await getDownloadRecord(1);
    expect(result?.guidesCompleted).toBe(2);
  });

  it('rejects an invalid write', async () => {
    const invalid = { ...makeDownloadRecord(), status: 'bogus' };
    await expect(putDownloadRecord(invalid as unknown as DownloadRecord)).rejects.toThrow();
  });

  it('lists all download records', async () => {
    await putDownloadRecord(makeDownloadRecord({ episodeId: 1 }));
    await putDownloadRecord(makeDownloadRecord({ episodeId: 2, title: 'Episode Two' }));

    const results = await getAllDownloadRecords();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.episodeId).sort()).toEqual([1, 2]);
  });

  it('drops a corrupt row on read instead of throwing', async () => {
    const db = await openOfflineDb();
    await db.put('downloads', { episodeId: 1, status: 'bogus' } as never);

    expect(await getDownloadRecord(1)).toBeNull();
  });

  it('drops a corrupt row from getAllDownloadRecords instead of throwing', async () => {
    await putDownloadRecord(makeDownloadRecord({ episodeId: 2 }));
    const db = await openOfflineDb();
    await db.put('downloads', { episodeId: 1, status: 'bogus' } as never);

    const results = await getAllDownloadRecords();
    expect(results).toHaveLength(1);
    expect(results[0].episodeId).toBe(2);
  });
});

describe('deleteEpisodeData', () => {
  it('cascades across all four stores', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    await putStudyGuide({ segmentId: 101, content: studyGuideFixture as never });
    await putStudyGuide({ segmentId: 102, content: studyGuideFixture as never });
    await putDownloadRecord(makeDownloadRecord());

    await deleteEpisodeData(1);

    expect(await getEpisodeSnapshot(1)).toBeNull();
    expect(await getStudyGuide(101)).toBeNull();
    expect(await getStudyGuide(102)).toBeNull();
    expect(await getDownloadRecord(1)).toBeNull();
  });

  it('is a no-op for an episode with no stored data', async () => {
    await expect(deleteEpisodeData(999)).resolves.toBeUndefined();
  });

  it('does not affect other episodes data', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    await putEpisodeSnapshot(makeSnapshot({ id: 2, title: 'Episode Two' }));
    await putDownloadRecord(makeDownloadRecord({ episodeId: 2 }));

    await deleteEpisodeData(1);

    expect(await getEpisodeSnapshot(1)).toBeNull();
    expect(await getEpisodeSnapshot(2)).not.toBeNull();
    expect(await getDownloadRecord(2)).not.toBeNull();
  });
});

describe('findEpisodeBySlugAndNumber', () => {
  it('resolves a stored episode by slug and number', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    const found = await findEpisodeBySlugAndNumber('my-podcast', 1);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(1);
    expect(found?.podcastSlug).toBe('my-podcast');
    expect(found?.episodeNumber).toBe(1);
  });

  it('returns null when slug or number do not match', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    expect(await findEpisodeBySlugAndNumber('other-podcast', 1)).toBeNull();
    expect(await findEpisodeBySlugAndNumber('my-podcast', 2)).toBeNull();
  });

  it('returns null on an empty store', async () => {
    expect(await findEpisodeBySlugAndNumber('my-podcast', 1)).toBeNull();
  });
});

describe('v1 -> v2 migration survival', () => {
  it('preserves existing v1 data and adds the by-id index + outbox store', async () => {
    // Hand-build a v1 database — only the four original stores, no by-id
    // index and no outbox store — bypassing the current (v2) openOfflineDb.
    const v1Db = await openDB(OFFLINE_DB_NAME, 1, {
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

    const snapshot = makeSnapshot();
    await v1Db.put('episodes', { ...snapshot.episode, episodeId: snapshot.episode.id });
    for (const segment of snapshot.segments) {
      await v1Db.put('segments', { ...segment, episodeId: snapshot.episode.id } as never);
    }
    v1Db.close();

    // Now open via the real (v2) path — this runs the upgrade migration
    // against the existing v1 database instead of a fresh install.
    await resetOfflineDbForTests();
    const db = await openOfflineDb();

    // Existing segment row survived untouched.
    const segmentRow = await db.get('segments', [snapshot.episode.id, 0]);
    expect(segmentRow?.id).toBe(101);
    expect(segmentRow?.studyStatus).toBe('new');

    // The new by-id index resolves the pre-existing row (re-indexed by the
    // upgrade's createIndex call, not written after the fact).
    const foundViaIndex = await db.getFromIndex('segments', 'by-id', 101);
    expect(foundViaIndex?.segmentIndex).toBe(0);

    // The outbox store exists and is empty.
    const outboxRows = await db.getAll('outbox');
    expect(outboxRows).toEqual([]);

    // Existing episode row survived.
    const episodeRow = await db.get('episodes', snapshot.episode.id);
    expect(episodeRow?.title).toBe('Episode One');
  });
});

describe('outbox entries', () => {
  const entry: OutboxEntry = {
    id: 'segment-status:101',
    kind: 'segment-status',
    targetId: 101,
    status: 'studying',
    clientTimestamp: 1000,
  };

  it('stores and retrieves an outbox entry', async () => {
    await putOutboxEntry(entry);
    expect(await getAllOutboxEntries()).toEqual([entry]);
  });

  it('coalesces on a repeated write to the same id (last-write-wins)', async () => {
    await putOutboxEntry(entry);
    const updated: OutboxEntry = { ...entry, status: 'learned', clientTimestamp: 2000 };
    await putOutboxEntry(updated);

    const all = await getAllOutboxEntries();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(updated);
  });

  it('deletes an entry', async () => {
    await putOutboxEntry(entry);
    await deleteOutboxEntry(entry.id);
    expect(await getAllOutboxEntries()).toEqual([]);
  });

  it('rejects an invalid write', async () => {
    const invalid = { ...entry, status: 'bogus' };
    await expect(putOutboxEntry(invalid as unknown as OutboxEntry)).rejects.toThrow();
  });

  it('drops a corrupt row on read instead of throwing', async () => {
    await putOutboxEntry(entry);
    const db = await openOfflineDb();
    await db.put('outbox', { id: 'bad', kind: 'bogus' } as never);

    const all = await getAllOutboxEntries();
    expect(all).toEqual([entry]);
  });
});

describe('updateStoredSegmentStudyStatus', () => {
  it('updates the studyStatus of the located segment row', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    const updated = await updateStoredSegmentStudyStatus(101, 'learned');

    expect(updated).toBe(true);
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.find((s) => s.id === 101)?.studyStatus).toBe('learned');
    // The sibling row is untouched.
    expect(snapshot?.segments.find((s) => s.id === 102)?.studyStatus).toBe('new');
  });

  it('returns false when no row matches the segment id', async () => {
    const updated = await updateStoredSegmentStudyStatus(999, 'learned');
    expect(updated).toBe(false);
  });
});

describe('setStoredEpisodeSegmentsStudyStatus', () => {
  it('cascades studyStatus to every segment row for the episode', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    const count = await setStoredEpisodeSegmentsStudyStatus(1, 'studying');

    expect(count).toBe(2);
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.every((s) => s.studyStatus === 'studying')).toBe(true);
  });

  it('does not affect another episode segments', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    await putEpisodeSnapshot(makeSnapshot({ id: 2, title: 'Episode Two' }));

    await setStoredEpisodeSegmentsStudyStatus(1, 'learned');

    const other = await getEpisodeSnapshot(2);
    expect(other?.segments.every((s) => s.studyStatus === 'new')).toBe(true);
  });

  it('returns 0 when the episode has no stored segments', async () => {
    const count = await setStoredEpisodeSegmentsStudyStatus(999, 'learned');
    expect(count).toBe(0);
  });
});
