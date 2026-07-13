import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';
import { resetOfflineDbForTests } from '../db';
import { hasStudyGuide } from '../store';
import { downloadEpisode, resetPersistRequestedForTests } from '../download';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function audioResponse(byteLength: number): Response {
  return new Response(new Uint8Array(byteLength), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg', 'content-length': String(byteLength) },
  });
}

const SNAPSHOT = {
  episode: {
    id: 5,
    title: 'Episode Five',
    episodeNumber: 5,
    durationMs: 60_000,
    podcastSlug: 'my-podcast',
    podcastName: 'My Podcast',
  },
  segments: [
    {
      id: 201,
      segmentIndex: 0,
      textRaw: '今日はいい天気です。',
      textFurigana: '今日はいい天気です。',
      furiganaStatus: 'ok' as const,
      furiganaWarning: null,
      startMs: 0,
      endMs: 3000,
      studyStatus: 'new' as const,
      sentences: [{ text: '今日はいい天気です。', start_ms: 0, end_ms: 3000 }],
    },
    {
      id: 202,
      segmentIndex: 1,
      textRaw: '散歩に行きましょう。',
      textFurigana: '散歩に行きましょう。',
      furiganaStatus: 'ok' as const,
      furiganaWarning: null,
      startMs: 3000,
      endMs: 6000,
      studyStatus: 'new' as const,
      sentences: [{ text: '散歩に行きましょう。', start_ms: 3000, end_ms: 6000 }],
    },
  ],
};

const DOWNLOAD_INPUT = {
  episodeId: 5,
  title: 'Episode Five',
  podcastSlug: 'my-podcast',
  episodeNumber: 5,
};

beforeEach(async () => {
  await resetOfflineDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('kiku-offline');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true) } });
  resetPersistRequestedForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadEpisode happy path', () => {
  it('downloads guides and audio, then marks the record complete', async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist: persistMock } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
        if (url.includes('/study-guide')) return jsonResponse({ success: true, data: studyGuideFixture });
        if (url.endsWith('/audio')) return audioResponse(1000);
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const onProgress = vi.fn();
    const record = await downloadEpisode(DOWNLOAD_INPUT, { onProgress });

    expect(record.status).toBe('complete');
    expect(record.guidesCompleted).toBe(2);
    expect(record.guidesTotal).toBe(2);
    expect(record.audioBytes).toBe(1000);
    expect(record.bytesTotal).toBe(1000);
    expect(record.completedAt).toBeTypeOf('number');
    expect(await hasStudyGuide(201)).toBe(true);
    expect(await hasStudyGuide(202)).toBe(true);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalled();
  });

  it('requests persistent storage at most once across repeated downloads', async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist: persistMock } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
        if (url.includes('/study-guide')) return jsonResponse({ success: true, data: studyGuideFixture });
        if (url.endsWith('/audio')) return audioResponse(1000);
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    await downloadEpisode(DOWNLOAD_INPUT);
    await downloadEpisode(DOWNLOAD_INPUT);

    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('completes without persisting storage when navigator is unavailable', async () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
        if (url.includes('/study-guide')) return jsonResponse({ success: true, data: studyGuideFixture });
        if (url.endsWith('/audio')) return audioResponse(1000);
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const record = await downloadEpisode(DOWNLOAD_INPUT);

    expect(record.status).toBe('complete');
  });
});

describe('downloadEpisode snapshot fetch failure', () => {
  it('fails at step guides when the offline-snapshot request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) {
          return jsonResponse({ success: false, error: 'episode is segmenting' }, 409);
        }
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const record = await downloadEpisode(DOWNLOAD_INPUT);

    expect(record.status).toBe('error');
    expect(record.step).toBe('guides');
    expect(record.error).toMatch(/segmenting/i);
  });

  it('falls back to a generic message when the error envelope has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return new Response(JSON.stringify({}), { status: 500 });
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const record = await downloadEpisode(DOWNLOAD_INPUT);

    expect(record.status).toBe('error');
    expect(record.error).toMatch(/request failed \(500\)/i);
  });
});

describe('downloadEpisode guide failure', () => {
  it('fails at step guides and retains whatever completed first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
        if (url.includes('/segments/201/study-guide')) {
          return jsonResponse({ success: true, data: studyGuideFixture });
        }
        if (url.includes('/segments/202/study-guide')) {
          await delay(20);
          return jsonResponse({ success: false, error: 'server error' }, 500);
        }
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const record = await downloadEpisode(DOWNLOAD_INPUT);

    expect(record.status).toBe('error');
    expect(record.step).toBe('guides');
    expect(record.error).toBeTruthy();
    expect(record.guidesCompleted).toBe(1);
    expect(await hasStudyGuide(201)).toBe(true);
    expect(await hasStudyGuide(202)).toBe(false);
  });
});

describe('downloadEpisode audio failure', () => {
  it('fails at step audio after guides already succeeded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
        if (url.includes('/study-guide')) return jsonResponse({ success: true, data: studyGuideFixture });
        if (url.endsWith('/audio')) return new Response('not found', { status: 500 });
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const record = await downloadEpisode(DOWNLOAD_INPUT);

    expect(record.status).toBe('error');
    expect(record.step).toBe('audio');
    expect(record.guidesCompleted).toBe(2);
    expect(await hasStudyGuide(201)).toBe(true);
    expect(await hasStudyGuide(202)).toBe(true);
  });
});

describe('downloadEpisode resume', () => {
  it('skips already-stored guides and already-cached audio', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
      if (url.includes('/study-guide')) return jsonResponse({ success: true, data: studyGuideFixture });
      if (url.endsWith('/audio')) return audioResponse(500);
      throw new Error(`unexpected fetch: ${url}`);
    });

    // First, run a full download for real with a working fetch mock so
    // subsequent "resume" behavior has something to skip.
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', undefined);
    await downloadEpisode(DOWNLOAD_INPUT);
    expect(await hasStudyGuide(201)).toBe(true);
    expect(await hasStudyGuide(202)).toBe(true);

    fetchMock.mockClear();

    const cachedAudioResponse = audioResponse(500);
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(cachedAudioResponse),
      }),
    });

    const record = await downloadEpisode(DOWNLOAD_INPUT);

    expect(record.status).toBe('complete');
    const studyGuideCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/study-guide')
    );
    const audioCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/audio'));
    expect(studyGuideCalls).toHaveLength(0);
    expect(audioCalls).toHaveLength(0);
  });
});

describe('downloadEpisode progress reporting', () => {
  it('reports increasing guidesCompleted and final audioBytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/offline-snapshot')) return jsonResponse({ success: true, data: SNAPSHOT });
        if (url.includes('/study-guide')) return jsonResponse({ success: true, data: studyGuideFixture });
        if (url.endsWith('/audio')) return audioResponse(2000);
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const progressRecords: number[] = [];
    await downloadEpisode(DOWNLOAD_INPUT, {
      onProgress: (record) => {
        if (record.step === 'guides') progressRecords.push(record.guidesCompleted);
      },
    });

    expect(progressRecords.length).toBeGreaterThan(0);
    expect(progressRecords[progressRecords.length - 1]).toBe(2);
    expect(new Set(progressRecords).size).toBeGreaterThan(0);
  });
});
