import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadAudio } from '../downloadAudio';

afterEach(() => {
  vi.unstubAllGlobals();
});

function audioResponse(byteLength: number, withContentLength = true): Response {
  return new Response(new Uint8Array(byteLength), {
    status: 200,
    headers: withContentLength
      ? { 'content-type': 'audio/mpeg', 'content-length': String(byteLength) }
      : { 'content-type': 'audio/mpeg' },
  });
}

describe('downloadAudio', () => {
  it('fetches and reports progress when nothing is cached', async () => {
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(audioResponse(200)));

    const progress: number[] = [];
    const result = await downloadAudio(5, (p) => {
      progress.push(p.audioBytes);
    });

    expect(result.audioBytes).toBe(200);
    expect(result.audioTotalBytes).toBe(200);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('falls through to fetch when caches has no match for this episode', async () => {
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match: vi.fn().mockResolvedValue(undefined) }),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(audioResponse(150)));

    const result = await downloadAudio(6, () => {});

    expect(result.audioBytes).toBe(150);
  });

  it('reports indeterminate total when Content-Length is missing', async () => {
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(audioResponse(80, false)));

    const result = await downloadAudio(7, () => {});

    expect(result.audioTotalBytes).toBeNull();
    expect(result.audioBytes).toBe(80);
  });

  it('treats a cached response with no Content-Length as zero bytes', async () => {
    const cachedResponse = audioResponse(999, false);
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match: vi.fn().mockResolvedValue(cachedResponse) }),
    });

    const result = await downloadAudio(10, () => {});

    expect(result.audioBytes).toBe(0);
    expect(result.audioTotalBytes).toBe(0);
  });

  it('returns cached progress without fetching when audio is already cached', async () => {
    const cachedResponse = audioResponse(999);
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match: vi.fn().mockResolvedValue(cachedResponse) }),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadAudio(8, () => {});

    expect(result.audioBytes).toBe(999);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the fetch response is not ok', async () => {
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));

    await expect(downloadAudio(9, () => {})).rejects.toThrow(/audio fetch failed/i);
  });
});
