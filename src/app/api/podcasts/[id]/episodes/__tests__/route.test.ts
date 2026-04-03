import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Drizzle db before importing the route
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
vi.mock('@/db', () => ({ db: { insert: mockInsert } }));
vi.mock('@/db/schema', () => ({ episodes: 'episodes_table' }));

describe('POST /api/podcasts/[id]/episodes', () => {
  beforeEach(() => {
    mockReturning.mockReset();
    mockInsert.mockClear();
  });

  async function callRoute(body: unknown, id = '5') {
    const { POST } = await import('../route');
    const request = new Request('http://localhost/api/podcasts/5/episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(request, { params: Promise.resolve({ id }) });
  }

  it('creates episode and returns 201 with episode data', async () => {
    const episode = { id: 1, podcastId: 5, episodeNumber: 3, audioUrl: 'https://blob.example.com/ep.mp3' };
    mockReturning.mockResolvedValueOnce([episode]);

    const res = await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3', episodeNumber: 3 });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual(episode);
    expect(mockInsert).toHaveBeenCalledWith('episodes_table');
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ podcastId: 5, episodeNumber: 3, audioUrl: 'https://blob.example.com/ep.mp3' })
    );
  });

  it('uses provided title when given', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 1 }]);

    await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3', episodeNumber: 1, title: 'My Episode' });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Episode' })
    );
  });

  it('falls back to "Episode N" title when title is omitted', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 1 }]);

    await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3', episodeNumber: 7 });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Episode 7' })
    );
  });

  it('returns 400 when blobUrl is missing', async () => {
    const res = await callRoute({ episodeNumber: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when blobUrl is not a valid URL', async () => {
    const res = await callRoute({ blobUrl: 'not-a-url', episodeNumber: 1 });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/url/i);
  });

  it('returns 400 when episodeNumber is missing', async () => {
    const res = await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when episodeNumber is less than 1', async () => {
    const res = await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3', episodeNumber: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate episode number', async () => {
    mockReturning.mockRejectedValueOnce({ code: '23505' });

    const res = await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3', episodeNumber: 1 });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already exists/i);
  });

  it('returns 500 on unexpected error', async () => {
    mockReturning.mockRejectedValueOnce(new Error('connection lost'));

    const res = await callRoute({ blobUrl: 'https://blob.example.com/ep.mp3', episodeNumber: 1 });

    expect(res.status).toBe(500);
  });
});
