import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RandomSegmentData } from '@/db/segments';

const mockGetRandomStudyingSegment = vi.fn();

vi.mock('@/db/segments', () => ({
  getRandomStudyingSegment: mockGetRandomStudyingSegment,
}));

const FAKE_SEGMENT: RandomSegmentData = {
  segmentId: 5,
  segmentIndex: 2,
  textRaw: '日本語の文です。',
  startMs: 1000,
  endMs: 3000,
  episodeId: 10,
  episodeNumber: 3,
  episodeTitle: 'Test Episode',
  podcastSlug: 'test-podcast',
  podcastName: 'Test Podcast',
};

describe('GET /api/segments/random', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRandomStudyingSegment.mockResolvedValue(null);
  });

  async function callRoute(url = 'http://localhost/api/segments/random') {
    const { GET } = await import('../route');
    return GET(new Request(url));
  }

  it('returns 200 with null data when no studying segment exists', async () => {
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  it('returns 200 with segment data when a studying segment exists', async () => {
    mockGetRandomStudyingSegment.mockResolvedValueOnce(FAKE_SEGMENT);
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data).toEqual(FAKE_SEGMENT);
  });

  it('returns 500 when the database throws', async () => {
    mockGetRandomStudyingSegment.mockRejectedValueOnce(new Error('db connection lost'));
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json.error).toMatch(/db connection lost/i);
  });

  it('passes the exclude segmentId to the DB function', async () => {
    await callRoute('http://localhost/api/segments/random?exclude=42');
    expect(mockGetRandomStudyingSegment).toHaveBeenCalledWith(42);
  });

  it('calls the DB function without an exclude id when param is absent', async () => {
    await callRoute();
    expect(mockGetRandomStudyingSegment).toHaveBeenCalledWith(undefined);
  });
});
