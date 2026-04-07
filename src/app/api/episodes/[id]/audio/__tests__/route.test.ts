import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GetBlobResult } from '@vercel/blob';

// Mock Drizzle db chain
const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
vi.mock('@/db', () => ({ db: { select: mockSelect } }));
vi.mock('@/db/schema', () => ({ episodes: 'episodes_table' }));

const mockGetPrivateBlob = vi.fn();
vi.mock('@/lib/blob', () => ({ getPrivateBlob: mockGetPrivateBlob }));

function makeBlob(overrides: Partial<GetBlobResult & { statusCode: number }> = {}): GetBlobResult {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode('audio')); c.close(); },
  });
  return {
    statusCode: 200,
    stream,
    headers: new Headers({
      'content-type': 'audio/mpeg',
      'content-length': '5',
    }),
    blob: {
      url: 'https://blob.example.com/ep1.mp3',
      downloadUrl: 'https://blob.example.com/ep1.mp3?dl=1',
      pathname: 'ep1.mp3',
      contentDisposition: 'inline',
      cacheControl: 'private',
      uploadedAt: new Date(),
      etag: 'abc',
      contentType: 'audio/mpeg',
      size: 5,
    },
    ...overrides,
  } as GetBlobResult;
}

describe('GET /api/episodes/[id]/audio', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWhere.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhere });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockGetPrivateBlob.mockReset();
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
  });

  it('returns 404 when episode is not found', async () => {
    mockWhere.mockResolvedValueOnce([]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/99/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when blob is not found', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockGetPrivateBlob.mockResolvedValueOnce(null);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 200 with Accept-Ranges header for a normal request', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockGetPrivateBlob.mockResolvedValueOnce(makeBlob());
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('forwards the Range header to getPrivateBlob', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockGetPrivateBlob.mockResolvedValueOnce(makeBlob());
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio', {
      headers: { Range: 'bytes=0-1023' },
    });
    await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(mockGetPrivateBlob).toHaveBeenCalledWith(
      'https://blob.example.com/ep1.mp3',
      { Range: 'bytes=0-1023' },
    );
  });

  it('does not pass extra headers when no Range is present', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockGetPrivateBlob.mockResolvedValueOnce(makeBlob());
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(mockGetPrivateBlob).toHaveBeenCalledWith(
      'https://blob.example.com/ep1.mp3',
      undefined,
    );
  });

  it('forwards Content-Range header for partial content responses', async () => {
    const blob = makeBlob({
      statusCode: 206,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '1024',
        'content-range': 'bytes 0-1023/50000',
      }),
    } as Partial<GetBlobResult>);
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockGetPrivateBlob.mockResolvedValueOnce(blob);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio', {
      headers: { Range: 'bytes=0-1023' },
    });
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1023/50000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('returns 304 for a not-modified response', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockGetPrivateBlob.mockResolvedValueOnce({ statusCode: 304, stream: null, headers: new Headers(), blob: null });
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(304);
  });
});
