import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlobNotFoundError } from '@vercel/blob';

// Mock Drizzle db chain
const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
vi.mock('@/db', () => ({ db: { select: mockSelect } }));
vi.mock('@/db/schema', () => ({ episodes: 'episodes_table' }));

const { mockHead } = vi.hoisted(() => ({
  mockHead: vi.fn(),
}));
vi.mock('@vercel/blob', async () => {
  const actual = await vi.importActual<typeof import('@vercel/blob')>('@vercel/blob');
  return { ...actual, head: mockHead };
});

function makeUpstreamResponse(
  status: number,
  headers: Record<string, string> = {},
  body = 'audio',
): Response {
  return new Response(body, { status, headers });
}

describe('GET /api/episodes/[id]/audio', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWhere.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhere });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockHead.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
  });

  it('returns 404 when episode is not found', async () => {
    mockWhere.mockResolvedValueOnce([]);
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/99/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 when blob head reports a missing blob', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockHead.mockRejectedValueOnce(new BlobNotFoundError());
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 500 when blob head fails for a non-404 reason', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockHead.mockRejectedValueOnce(new Error('blob service unavailable'));
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(500);
  });

  it('returns 200 with Accept-Ranges for a normal request', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockHead.mockResolvedValueOnce({
      downloadUrl: 'https://cdn.example.com/ep1.mp3?token=x',
      contentType: 'audio/mpeg',
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      makeUpstreamResponse(200, { 'content-type': 'audio/mpeg', 'content-length': '5000000' }),
    );
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Content-Length')).toBe('5000000');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600');
  });

  it('forwards the Range header to the upstream fetch', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockHead.mockResolvedValueOnce({
      downloadUrl: 'https://cdn.example.com/ep1.mp3?token=x',
      contentType: 'audio/mpeg',
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      makeUpstreamResponse(206, {
        'content-type': 'audio/mpeg',
        'content-length': '4000000',
        'content-range': 'bytes 1000000-5000000/5000000',
      }),
    );
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio', {
      headers: { Range: 'bytes=1000000-' },
    });
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://cdn.example.com/ep1.mp3?token=x',
      { headers: { authorization: 'Bearer token', Range: 'bytes=1000000-' } },
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 1000000-5000000/5000000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('does not set Range header when no Range in request', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockHead.mockResolvedValueOnce({
      downloadUrl: 'https://cdn.example.com/ep1.mp3?token=x',
      contentType: 'audio/mpeg',
    });
    vi.mocked(fetch).mockResolvedValueOnce(makeUpstreamResponse(200));
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://cdn.example.com/ep1.mp3?token=x',
      { headers: { authorization: 'Bearer token' } },
    );
  });

  it('does not cache upstream error responses', async () => {
    mockWhere.mockResolvedValueOnce([{ audioUrl: 'https://blob.example.com/ep1.mp3' }]);
    mockHead.mockResolvedValueOnce({
      downloadUrl: 'https://cdn.example.com/ep1.mp3?token=x',
      contentType: 'audio/mpeg',
    });
    vi.mocked(fetch).mockResolvedValueOnce(makeUpstreamResponse(403, {}, 'Forbidden'));

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/episodes/1/audio');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
