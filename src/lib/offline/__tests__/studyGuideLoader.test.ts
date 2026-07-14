import 'fake-indexeddb/auto';
import studyGuideFixture from '@fixtures/study-guide.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineDbForTests } from '../db';
import { putStudyGuide } from '../store';
import { loadStudyGuideContent } from '../studyGuideLoader';
import type { StudyGuideContent } from '@/lib/api/types';

const content = studyGuideFixture as StudyGuideContent;
const SEGMENT_ID = 42;
const URL = '/api/segments/42/study-guide';

function okResponse(data: StudyGuideContent): Response {
  return new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 });
}

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, data: null, error }), { status });
}

beforeEach(async () => {
  await resetOfflineDbForTests();
  indexedDB.deleteDatabase('kiku-offline');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadStudyGuideContent — online', () => {
  it('returns the network response when the fetch succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(content));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: true });

    expect(result).toEqual(content);
    expect(fetchMock).toHaveBeenCalledWith(URL);
  });

  it('falls back to IndexedDB when the network fails', async () => {
    await putStudyGuide({ segmentId: SEGMENT_ID, content });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: true });

    expect(result).toEqual(content);
  });

  it('falls back to IndexedDB on an error envelope', async () => {
    await putStudyGuide({ segmentId: SEGMENT_ID, content });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500, 'boom')));

    const result = await loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: true });

    expect(result).toEqual(content);
  });

  it('rethrows the network error when IndexedDB has no copy either', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500, 'boom')));

    await expect(loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: true })).rejects.toThrow('boom');
  });
});

describe('loadStudyGuideContent — offline', () => {
  it('reads from IndexedDB without attempting a fetch', async () => {
    await putStudyGuide({ segmentId: SEGMENT_ID, content });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: false });

    expect(result).toEqual(content);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a download hint when IndexedDB has no copy', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: false })).rejects.toThrow(
      /not available offline/i,
    );
  });
});

describe('loadStudyGuideContent — unusable IndexedDB', () => {
  it('treats a throwing store read as a miss and surfaces the network error', async () => {
    const realIndexedDB = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500, 'boom')));

    try {
      await expect(loadStudyGuideContent(SEGMENT_ID, URL, { isOnline: true })).rejects.toThrow('boom');
    } finally {
      vi.stubGlobal('indexedDB', realIndexedDB);
    }
  });
});
