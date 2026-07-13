import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineDbForTests } from '../db';
import {
  getDownloadRecord as readDownloadRecordFromIdb,
  putDownloadRecord as writeDownloadRecordToIdb,
} from '../store';
import {
  ensureInitialized,
  failDownload,
  finishDownload,
  getSnapshot,
  refresh,
  removeDownload,
  resetDownloadStoreForTests,
  startDownload,
  subscribe,
  updateProgress,
} from '../downloadStore';

beforeEach(async () => {
  resetDownloadStoreForTests();
  await resetOfflineDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('kiku-offline');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function startInput(episodeId: number, overrides: { guidesTotal?: number } = {}) {
  return {
    episodeId,
    title: `Episode ${episodeId}`,
    podcastSlug: 'my-podcast',
    episodeNumber: episodeId,
    guidesTotal: overrides.guidesTotal ?? 3,
  };
}

describe('subscribe/notify', () => {
  it('notifies subscribers when a mutator persists', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    await startDownload(startInput(1));

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('stops notifying after unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();

    await startDownload(startInput(2));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('mutators persist to IndexedDB and update the in-memory snapshot', () => {
  it('startDownload creates a downloading/guides record', async () => {
    const record = await startDownload(startInput(3, { guidesTotal: 5 }));

    expect(record).toMatchObject({
      episodeId: 3,
      status: 'downloading',
      step: 'guides',
      guidesCompleted: 0,
      guidesTotal: 5,
      audioBytes: 0,
    });
    expect(getSnapshot(3)).toEqual(record);
    expect(await readDownloadRecordFromIdb(3)).toEqual(record);
  });

  it('updateProgress merges a partial patch', async () => {
    await startDownload(startInput(4, { guidesTotal: 2 }));
    const updated = await updateProgress(4, { guidesCompleted: 1 });

    expect(updated.guidesCompleted).toBe(1);
    expect(updated.guidesTotal).toBe(2);
    expect(getSnapshot(4)).toEqual(updated);
    expect(await readDownloadRecordFromIdb(4)).toEqual(updated);
  });

  it('updateProgress throws for an episode with no in-progress download', async () => {
    await expect(updateProgress(999, { guidesCompleted: 1 })).rejects.toThrow(/no in-progress/i);
  });

  it('finishDownload marks complete and stamps bytesTotal/completedAt', async () => {
    await startDownload(startInput(5));
    const finished = await finishDownload(5, 12_345);

    expect(finished.status).toBe('complete');
    expect(finished.bytesTotal).toBe(12_345);
    expect(finished.completedAt).toBeTypeOf('number');
    expect(await readDownloadRecordFromIdb(5)).toEqual(finished);
  });

  it('failDownload marks error and retains prior progress', async () => {
    await startDownload(startInput(6, { guidesTotal: 4 }));
    await updateProgress(6, { guidesCompleted: 2 });
    const failed = await failDownload(6, 'guides', 'network error');

    expect(failed.status).toBe('error');
    expect(failed.step).toBe('guides');
    expect(failed.error).toBe('network error');
    expect(failed.guidesCompleted).toBe(2);
    expect(await readDownloadRecordFromIdb(6)).toEqual(failed);
  });
});

describe('refresh', () => {
  it('loads existing IndexedDB records into memory', async () => {
    await startDownload(startInput(7));
    resetDownloadStoreForTests();
    expect(getSnapshot(7)).toBeUndefined();

    await refresh();

    expect(getSnapshot(7)?.episodeId).toBe(7);
  });
});

describe('ensureInitialized', () => {
  it('loads from IndexedDB on the first call', async () => {
    await writeDownloadRecordToIdb({
      episodeId: 30,
      status: 'complete',
      step: 'audio',
      guidesCompleted: 3,
      guidesTotal: 3,
      audioBytes: 100,
      audioTotalBytes: 100,
      bytesTotal: 100,
      title: 'Episode 30',
      podcastSlug: 'my-podcast',
      episodeNumber: 30,
      updatedAt: Date.now(),
    });

    expect(getSnapshot(30)).toBeUndefined();
    await ensureInitialized();
    expect(getSnapshot(30)?.episodeId).toBe(30);
  });

  it('is a no-op on subsequent calls', async () => {
    await ensureInitialized();

    await writeDownloadRecordToIdb({
      episodeId: 31,
      status: 'complete',
      step: 'audio',
      guidesCompleted: 1,
      guidesTotal: 1,
      audioBytes: 10,
      audioTotalBytes: 10,
      bytesTotal: 10,
      title: 'Episode 31',
      podcastSlug: 'my-podcast',
      episodeNumber: 31,
      updatedAt: Date.now(),
    });

    // Second call should not reload — the record written directly to
    // IndexedDB after the first (already-resolved) init stays invisible
    // until an explicit refresh().
    await ensureInitialized();
    expect(getSnapshot(31)).toBeUndefined();
  });
});

describe('cross-tab BroadcastChannel notify', () => {
  it('refreshes the in-memory cache when another tab posts an update', async () => {
    // Trigger a mutator so the module's own BroadcastChannel + onmessage
    // handler are lazily created.
    await startDownload(startInput(40));

    // Simulate another tab writing directly to IndexedDB and broadcasting.
    await writeDownloadRecordToIdb({
      episodeId: 41,
      status: 'complete',
      step: 'audio',
      guidesCompleted: 2,
      guidesTotal: 2,
      audioBytes: 50,
      audioTotalBytes: 50,
      bytesTotal: 50,
      title: 'Episode 41',
      podcastSlug: 'my-podcast',
      episodeNumber: 41,
      updatedAt: Date.now(),
    });
    const otherTabChannel = new BroadcastChannel('kiku-downloads');
    otherTabChannel.postMessage({ type: 'download-updated' });
    otherTabChannel.close();

    await vi.waitFor(() => {
      expect(getSnapshot(41)?.episodeId).toBe(41);
    });
  });
});

describe('BroadcastChannel unavailable', () => {
  it('does not throw when BroadcastChannel is not supported', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    await expect(startDownload(startInput(42))).resolves.toBeDefined();
  });
});

describe('removeDownload', () => {
  it('purges the IndexedDB record and clears the in-memory snapshot', async () => {
    await startDownload(startInput(8));

    await removeDownload(8);

    expect(getSnapshot(8)).toBeUndefined();
    expect(await readDownloadRecordFromIdb(8)).toBeNull();
  });

  it('calls caches.delete for the episode audio when caches is available', async () => {
    await startDownload(startInput(9));
    const deleteMock = vi.fn().mockResolvedValue(true);
    const openMock = vi.fn().mockResolvedValue({ delete: deleteMock });
    vi.stubGlobal('caches', { open: openMock });

    await removeDownload(9);

    expect(openMock).toHaveBeenCalledWith('kiku-audio');
    expect(deleteMock).toHaveBeenCalledWith('/api/episodes/9/audio', {
      ignoreSearch: true,
      ignoreVary: true,
    });
  });

  it('does not throw when caches is unavailable', async () => {
    await startDownload(startInput(10));
    // Node test environment has no global `caches` by default.
    await expect(removeDownload(10)).resolves.toBeUndefined();
  });

  it('does not throw when the caches.delete call itself fails', async () => {
    await startDownload(startInput(11));
    vi.stubGlobal('caches', {
      open: vi.fn().mockRejectedValue(new Error('cache storage unavailable')),
    });

    await expect(removeDownload(11)).resolves.toBeUndefined();
  });
});
