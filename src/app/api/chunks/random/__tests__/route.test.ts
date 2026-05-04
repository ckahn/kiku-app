import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RandomSegmentData } from '@/db/chunks';

const mockGetRandomStudyingChunk = vi.fn();

vi.mock('@/db/chunks', () => ({
  getRandomStudyingChunk: mockGetRandomStudyingChunk,
}));

const FAKE_CHUNK: RandomSegmentData = {
  chunkId: 5,
  chunkIndex: 2,
  textRaw: '日本語の文です。',
  startMs: 1000,
  endMs: 3000,
  episodeId: 10,
  episodeNumber: 3,
  episodeTitle: 'Test Episode',
  podcastSlug: 'test-podcast',
  podcastName: 'Test Podcast',
};

describe('GET /api/chunks/random', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRandomStudyingChunk.mockResolvedValue(null);
  });

  async function callRoute(url = 'http://localhost/api/chunks/random') {
    const { GET } = await import('../route');
    return GET(new Request(url));
  }

  it('returns 200 with null data when no studying chunk exists', async () => {
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  it('returns 200 with chunk data when a studying chunk exists', async () => {
    mockGetRandomStudyingChunk.mockResolvedValueOnce(FAKE_CHUNK);
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data).toEqual(FAKE_CHUNK);
  });

  it('returns 500 when the database throws', async () => {
    mockGetRandomStudyingChunk.mockRejectedValueOnce(new Error('db connection lost'));
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json.error).toMatch(/db connection lost/i);
  });

  it('passes the exclude chunkId to the DB function', async () => {
    await callRoute('http://localhost/api/chunks/random?exclude=42');
    expect(mockGetRandomStudyingChunk).toHaveBeenCalledWith(42);
  });

  it('calls the DB function without an exclude id when param is absent', async () => {
    await callRoute();
    expect(mockGetRandomStudyingChunk).toHaveBeenCalledWith(undefined);
  });
});
