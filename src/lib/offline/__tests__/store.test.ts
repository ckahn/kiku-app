import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';
import { openOfflineDb, resetOfflineDbForTests } from '../db';
import {
  deleteEpisodeData,
  getAllDownloadRecords,
  getDownloadRecord,
  getEpisodeSnapshot,
  getStudyGuide,
  hasStudyGuide,
  putDownloadRecord,
  putEpisodeSnapshot,
  putStudyGuide,
} from '../store';
import type { DownloadRecord, EpisodeSnapshot, StoredStudyGuide } from '../types';

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
