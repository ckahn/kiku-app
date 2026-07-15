// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineDbForTests } from '../db';
import { getAllOutboxEntries, putOutboxEntry } from '../store';
import {
  acknowledgeError,
  discard,
  ensureOutboxInitialized,
  enqueue,
  getStateSnapshot,
  refresh,
  replay,
  resetOutboxStoreForTests,
  retry,
  subscribe,
  syncAfterExternalChange,
  withTargetWriteLock,
} from '../outboxStore';
import type { OutboxEntry } from '../types';

beforeEach(async () => {
  resetOutboxStoreForTests();
  await resetOfflineDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('kiku-offline');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'segment-status:101',
    kind: 'segment-status',
    targetId: 101,
    status: 'studying',
    clientTimestamp: 1000,
    ...overrides,
  };
}

function okResponse(): Response {
  return new Response(null, { status: 200 });
}

function statusResponse(status: number): Response {
  return new Response(null, { status });
}

describe('enqueue', () => {
  it('persists the entry and updates the reactive count', async () => {
    await enqueue(makeEntry());

    expect(getStateSnapshot().count).toBe(1);
    expect(await getAllOutboxEntries()).toEqual([makeEntry()]);
  });

  it('coalesces repeated enqueues of the same target to the latest (last-write-wins)', async () => {
    await enqueue(makeEntry({ status: 'studying', clientTimestamp: 1000 }));
    await enqueue(makeEntry({ status: 'learned', clientTimestamp: 2000 }));

    expect(getStateSnapshot().count).toBe(1);
    const stored = await getAllOutboxEntries();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('learned');
  });

  it('notifies subscribers', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    await enqueue(makeEntry());

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('getStateSnapshot referential stability', () => {
  it('returns the same reference across calls when nothing changed', () => {
    const first = getStateSnapshot();
    const second = getStateSnapshot();
    expect(first).toBe(second);
  });

  it('returns a new reference only after a real change', async () => {
    const before = getStateSnapshot();
    await enqueue(makeEntry());
    const after = getStateSnapshot();

    expect(after).not.toBe(before);
    expect(getStateSnapshot()).toBe(after);
  });
});

describe('discard', () => {
  it('removes an entry without replaying it', async () => {
    await enqueue(makeEntry());
    await discard(makeEntry().id);

    expect(getStateSnapshot().count).toBe(0);
    expect(await getAllOutboxEntries()).toEqual([]);
  });
});

describe('replay', () => {
  it('applies entries in clientTimestamp order and deletes them on success', async () => {
    const calledUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calledUrls.push(url);
      return okResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    await enqueue(makeEntry({ id: 'segment-status:2', targetId: 2, clientTimestamp: 2000 }));
    await enqueue(makeEntry({ id: 'segment-status:1', targetId: 1, clientTimestamp: 1000 }));

    await replay();

    expect(calledUrls).toEqual(['/api/segments/1/study', '/api/segments/2/study']);
    expect(getStateSnapshot().count).toBe(0);
    expect(await getAllOutboxEntries()).toEqual([]);
  });

  it('drops the entry and sets an error on a permanent failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => statusResponse(404)));

    await enqueue(makeEntry());
    await replay();

    expect(getStateSnapshot()).toEqual({ count: 0, error: expect.any(String) });
    expect(await getAllOutboxEntries()).toEqual([]);
  });

  it('keeps the entry and stops the loop on a transient HTTP failure, leaving later entries untouched', async () => {
    const fetchMock = vi.fn(async () => statusResponse(503));
    vi.stubGlobal('fetch', fetchMock);

    await enqueue(makeEntry({ id: 'segment-status:1', targetId: 1, clientTimestamp: 1000 }));
    await enqueue(makeEntry({ id: 'segment-status:2', targetId: 2, clientTimestamp: 2000 }));

    await replay();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getStateSnapshot().count).toBe(2);
  });

  it('keeps the entry and stops the loop on a network throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    await enqueue(makeEntry());
    await replay();

    expect(getStateSnapshot().count).toBe(1);
  });

  it('concurrent replay calls share a single in-flight drain', async () => {
    let resolveFirst: (() => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = () => resolve(okResponse());
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await enqueue(makeEntry());

    const first = replay();
    const second = replay(); // must join the in-flight drain, not start another

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await first;
    expect(getStateSnapshot().count).toBe(0);
  });

  it('skips a target currently being written by mutateWithOutbox and keeps its entry', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await enqueue(makeEntry());

    let releaseWrite: (() => void) | null = null;
    const writeDone = withTargetWriteLock(
      makeEntry().id,
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = () => resolve();
        })
    );

    await replay();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getStateSnapshot().count).toBe(1);

    releaseWrite?.();
    await writeDone;
  });
});

describe('withTargetWriteLock', () => {
  it('waits for an in-flight replay of the same target before running the write', async () => {
    let resolveReplayFetch: (() => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveReplayFetch = () => resolve(okResponse());
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    await enqueue(makeEntry());

    const drain = replay(); // first fetch (the queued value) issued and pending

    const writeOrder: string[] = [];
    const write = withTargetWriteLock(makeEntry().id, async () => {
      writeOrder.push('write');
    });

    // The write must be parked behind the drain, not run immediately.
    await Promise.resolve();
    expect(writeOrder).toEqual([]);

    resolveReplayFetch?.();
    await drain;
    await write;
    expect(writeOrder).toEqual(['write']);
  });

  it('runs immediately when no replay is in flight for the target', async () => {
    const result = await withTargetWriteLock('segment-status:5', async () => 'ran');
    expect(result).toBe('ran');
  });
});

describe('online-triggered replay', () => {
  it('ensureOutboxInitialized drains a queue left from a previous session when already online', async () => {
    // jsdom defaults navigator.onLine to true.
    expect(navigator.onLine).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    await enqueue(makeEntry());
    resetOutboxStoreForTests(); // simulate a fresh page load with the entry already in IDB

    await ensureOutboxInitialized();
    // Init kicks the drain fire-and-forget, but replay() retains the
    // in-flight promise, so awaiting replay() joins it deterministically
    // (and is a fast no-op drain if it already finished).
    await replay();

    expect(getStateSnapshot().count).toBe(0);
  });

  it('the window online event triggers a drain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    await ensureOutboxInitialized();
    await enqueue(makeEntry());

    window.dispatchEvent(new Event('online'));
    // The listener starts the drain synchronously; join the retained promise.
    await replay();

    expect(getStateSnapshot().count).toBe(0);
  });
});

describe('cross-tab sync', () => {
  it('initialization opens the BroadcastChannel eagerly so a passive tab hears external changes', async () => {
    await ensureOutboxInitialized();

    // Simulate another tab writing directly to IndexedDB and pinging --
    // this tab has performed no local writes, so without the eager channel
    // it would never hear about the change.
    await putOutboxEntry(makeEntry());
    const otherTabChannel = new BroadcastChannel('kiku-outbox');
    otherTabChannel.postMessage(null);
    otherTabChannel.close();

    await vi.waitFor(() => {
      expect(getStateSnapshot().count).toBe(1);
    });
  });
});

describe('manual retry and error acknowledgement', () => {
  it('retry() drains the queue on demand (e.g. after a transient failure while online)', async () => {
    // First attempt fails transiently while online -- no `online` event will
    // ever fire to retry it, so the entry would otherwise sit forever.
    vi.stubGlobal('fetch', vi.fn(async () => statusResponse(503)));
    await enqueue(makeEntry());
    await replay();
    expect(getStateSnapshot().count).toBe(1);

    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    await retry();

    expect(getStateSnapshot().count).toBe(0);
  });

  it('acknowledgeError() clears the sticky error and notifies subscribers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => statusResponse(404)));
    await enqueue(makeEntry());
    await replay();
    expect(getStateSnapshot().error).not.toBeNull();

    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    acknowledgeError();

    expect(getStateSnapshot().error).toBeNull();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('acknowledgeError() is a silent no-op when there is no error', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    acknowledgeError();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('refresh', () => {
  it('reloads the in-memory queue from IndexedDB', async () => {
    await enqueue(makeEntry());
    resetOutboxStoreForTests();

    expect(getStateSnapshot().count).toBe(0);
    await refresh();
    expect(getStateSnapshot().count).toBe(1);
  });

  it('syncAfterExternalChange reloads the mirror after an external IDB change', async () => {
    await enqueue(makeEntry());
    // Simulate deleteEpisodeData's cascade removing the row behind the store's back.
    const { deleteOutboxEntry } = await import('../store');
    await deleteOutboxEntry(makeEntry().id);
    expect(getStateSnapshot().count).toBe(1); // mirror is stale

    await syncAfterExternalChange();

    expect(getStateSnapshot().count).toBe(0);
  });
});
