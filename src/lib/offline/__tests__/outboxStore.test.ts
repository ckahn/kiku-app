// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineDbForTests } from '../db';
import { getAllOutboxEntries } from '../store';
import {
  discard,
  ensureOutboxInitialized,
  enqueue,
  getStateSnapshot,
  refresh,
  replay,
  resetOutboxStoreForTests,
  subscribe,
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

  it('the replaying guard prevents a concurrent double-drain', async () => {
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
    const second = replay(); // should return immediately (replaying === true)

    await second;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await first;
    expect(getStateSnapshot().count).toBe(0);
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
    // Allow the fire-and-forget replay() kicked off inside init to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getStateSnapshot().count).toBe(0);
  });

  it('the window online event triggers a drain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    await ensureOutboxInitialized();
    await enqueue(makeEntry());

    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getStateSnapshot().count).toBe(0);
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
});
