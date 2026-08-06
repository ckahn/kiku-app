import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetEpisodeWithPodcast = vi.fn();
const mockGetSegmentsByEpisodeId = vi.fn();

vi.mock('@/db/episodes', () => ({
  getEpisodeWithPodcast: mockGetEpisodeWithPodcast,
}));

vi.mock('@/db/segments', () => ({
  getSegmentsByEpisodeId: mockGetSegmentsByEpisodeId,
}));

describe('GET /api/episodes/[id]/offline-snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEpisodeWithPodcast.mockResolvedValue({
      id: 5,
      title: 'Episode Five',
      episodeNumber: 5,
      durationMs: 120_000,
      status: 'ready',
      podcastSlug: 'my-podcast',
      podcastName: 'My Podcast',
    });
    mockGetSegmentsByEpisodeId.mockResolvedValue([
      {
        id: 101,
        episodeId: 5,
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
    ]);
  });

  async function callRoute(id: string) {
    const { GET } = await import('../route');
    const request = new Request(`http://localhost/api/episodes/${id}/offline-snapshot`);
    return GET(request, { params: Promise.resolve({ id }) });
  }

  it('returns 400 for an invalid episode id', async () => {
    const response = await callRoute('abc');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/invalid episode id/i);
  });

  it('returns 404 when the episode is missing', async () => {
    mockGetEpisodeWithPodcast.mockResolvedValueOnce(null);

    const response = await callRoute('5');
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 409 when the episode is not ready', async () => {
    mockGetEpisodeWithPodcast.mockResolvedValueOnce({
      id: 5,
      title: 'Episode Five',
      episodeNumber: 5,
      durationMs: null,
      status: 'segmenting',
      podcastSlug: 'my-podcast',
      podcastName: 'My Podcast',
    });

    const response = await callRoute('5');
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toMatch(/segmenting/i);
    expect(mockGetSegmentsByEpisodeId).not.toHaveBeenCalled();
  });

  it('returns the episode snapshot shaped for episodeSnapshotSchema', async () => {
    const response = await callRoute('5');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      episode: {
        id: 5,
        title: 'Episode Five',
        episodeNumber: 5,
        durationMs: 120_000,
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
      ],
    });
  });

  it('returns 500 when the db lookup fails', async () => {
    mockGetEpisodeWithPodcast.mockRejectedValueOnce(new Error('db connection lost'));

    const response = await callRoute('5');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toMatch(/db connection lost/i);
  });

  it('returns 500 when the assembled snapshot fails schema validation', async () => {
    mockGetSegmentsByEpisodeId.mockResolvedValueOnce([
      { id: 101, episodeId: 5, segmentIndex: 0, textRaw: '', textFurigana: '', furiganaStatus: 'bogus', furiganaWarning: null, startMs: 0, endMs: 1, studyStatus: 'new', sentences: [] },
    ]);

    const response = await callRoute('5');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
