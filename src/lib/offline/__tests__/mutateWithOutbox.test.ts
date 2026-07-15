// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineDbForTests } from '../db';
import { getAllOutboxEntries, getEpisodeSnapshot, putEpisodeSnapshot, putOutboxEntry } from '../store';
import { enqueue, replay, resetOutboxStoreForTests } from '../outboxStore';
import { mutateWithOutbox } from '../mutateWithOutbox';
import type { EpisodeSnapshot } from '../types';

function makeSnapshot(): EpisodeSnapshot {
  return {
    episode: {
      id: 1,
      title: 'Episode One',
      episodeNumber: 1,
      durationMs: 60_000,
      podcastSlug: 'my-podcast',
      podcastName: 'My Podcast',
    },
    segments: [
      {
        id: 101,
        segmentIndex: 0,
        textRaw: '今日はいい天気です。',
        textFurigana: '今日はいい天気です。',
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

function okResponse(): Response {
  return new Response(null, { status: 200 });
}

function statusResponse(status: number): Response {
  return new Response(JSON.stringify({ error: 'boom' }), { status });
}

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
});

describe('mutateWithOutbox — online', () => {
  it('synced: online success returns synced, refreshes the stored row, and does not queue', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    const result = await mutateWithOutbox({
      kind: 'segment-status',
      targetId: 101,
      status: 'learned',
      isOnline: true,
    });

    expect(result).toEqual({ outcome: 'synced' });
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.find((s) => s.id === 101)?.studyStatus).toBe('learned');
    expect(await getAllOutboxEntries()).toEqual([]);
  });

  it('online success clears a pre-existing coalesced entry for the same target', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    await putOutboxEntry({
      id: 'segment-status:101',
      kind: 'segment-status',
      targetId: 101,
      status: 'studying',
      clientTimestamp: 500,
    });
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    await mutateWithOutbox({
      kind: 'segment-status',
      targetId: 101,
      status: 'learned',
      isOnline: true,
    });

    expect(await getAllOutboxEntries()).toEqual([]);
  });

  it('online permanent failure throws and does not queue', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    vi.stubGlobal('fetch', vi.fn(async () => statusResponse(404)));

    await expect(
      mutateWithOutbox({ kind: 'segment-status', targetId: 101, status: 'learned', isOnline: true })
    ).rejects.toThrow('boom');

    expect(await getAllOutboxEntries()).toEqual([]);
  });

  it('online transient HTTP failure on a downloaded episode falls back to queued', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    vi.stubGlobal('fetch', vi.fn(async () => statusResponse(503)));

    const result = await mutateWithOutbox({
      kind: 'segment-status',
      targetId: 101,
      status: 'learned',
      isOnline: true,
    });

    expect(result).toEqual({ outcome: 'queued' });
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.find((s) => s.id === 101)?.studyStatus).toBe('learned');
    expect(await getAllOutboxEntries()).toHaveLength(1);
  });

  it('online network throw on a downloaded episode falls back to queued', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    const result = await mutateWithOutbox({
      kind: 'segment-status',
      targetId: 101,
      status: 'learned',
      isOnline: true,
    });

    expect(result).toEqual({ outcome: 'queued' });
  });
});

describe('mutateWithOutbox — offline', () => {
  it('offline + downloaded segment: queues, writes the optimistic row, coalesces', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await mutateWithOutbox({
      kind: 'segment-status',
      targetId: 101,
      status: 'studying',
      isOnline: false,
    });

    expect(result).toEqual({ outcome: 'queued' });
    expect(fetchMock).not.toHaveBeenCalled();
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.find((s) => s.id === 101)?.studyStatus).toBe('studying');
    const entries = await getAllOutboxEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'segment-status', targetId: 101, status: 'studying' });
  });

  it('offline + downloaded episode cascade: queues one episode-status entry, updates all segments', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    const result = await mutateWithOutbox({
      kind: 'episode-status',
      targetId: 1,
      status: 'studying',
      isOnline: false,
    });

    expect(result).toEqual({ outcome: 'queued' });
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.every((s) => s.studyStatus === 'studying')).toBe(true);
    expect(await getAllOutboxEntries()).toEqual([
      { id: 'episode-status:1', kind: 'episode-status', targetId: 1, status: 'studying', clientTimestamp: expect.any(Number) },
    ]);
  });

  it('repeated offline flips coalesce to one entry with the latest status', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    await mutateWithOutbox({ kind: 'segment-status', targetId: 101, status: 'studying', isOnline: false });
    await mutateWithOutbox({ kind: 'segment-status', targetId: 101, status: 'learned', isOnline: false });

    const entries = await getAllOutboxEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('learned');
  });

  it('offline + not downloaded throws and queues nothing', async () => {
    await expect(
      mutateWithOutbox({ kind: 'segment-status', targetId: 999, status: 'learned', isOnline: false })
    ).rejects.toThrow();

    expect(await getAllOutboxEntries()).toEqual([]);
  });
});

describe('mutateWithOutbox — replay coordination (same-tab race)', () => {
  it('a fresh online write for a target mid-replay waits for the replay, so the fresh value lands last', async () => {
    await putEpisodeSnapshot(makeSnapshot());

    const bodies: string[] = [];
    let resolveReplayFetch: (() => void) | null = null;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) {
        // The replay's PATCH (old queued value) -- held open.
        return new Promise<Response>((resolve) => {
          resolveReplayFetch = () => resolve(okResponse());
        });
      }
      return Promise.resolve(okResponse());
    });
    vi.stubGlobal('fetch', fetchMock);

    // An old value queued from an earlier offline session.
    await enqueue({
      id: 'segment-status:101',
      kind: 'segment-status',
      targetId: 101,
      status: 'studying',
      clientTimestamp: 1000,
    });

    const drain = replay(); // issues the first fetch (old value) synchronously

    // The user makes a fresh change while the replay is still in flight.
    const mutatePromise = mutateWithOutbox({
      kind: 'segment-status',
      targetId: 101,
      status: 'learned',
      isOnline: true,
    });

    // The fresh PATCH must be parked behind the in-flight replay.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveReplayFetch?.();
    await drain;
    const result = await mutatePromise;

    expect(result).toEqual({ outcome: 'synced' });
    expect(bodies).toEqual([
      JSON.stringify({ studyStatus: 'studying' }),
      JSON.stringify({ studyStatus: 'learned' }),
    ]);
    expect(await getAllOutboxEntries()).toEqual([]);
    const snapshot = await getEpisodeSnapshot(1);
    expect(snapshot?.segments.find((s) => s.id === 101)?.studyStatus).toBe('learned');
  });
});
