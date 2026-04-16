import { beforeEach, describe, expect, it, vi } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

const mockGetChunkById = vi.fn();
const mockGetChunksByEpisodeId = vi.fn();
const mockGetStudyGuideByChunkId = vi.fn();
const mockSaveStudyGuideForChunkId = vi.fn();
const mockGenerateStudyGuideFromProvider = vi.fn();

vi.mock('@/db/chunks', () => ({
  getChunkById: mockGetChunkById,
  getChunksByEpisodeId: mockGetChunksByEpisodeId,
}));

vi.mock('@/db/study-guides', () => ({
  getStudyGuideByChunkId: mockGetStudyGuideByChunkId,
  saveStudyGuideForChunkId: mockSaveStudyGuideForChunkId,
}));

vi.mock('@/lib/api/study-guide-provider', () => ({
  generateStudyGuideFromProvider: mockGenerateStudyGuideFromProvider,
}));

describe('GET /api/chunks/[id]/study-guide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChunkById.mockResolvedValue({ id: 12, episodeId: 5, textRaw: '日本語の文です。' });
    mockGetChunksByEpisodeId.mockResolvedValue([
      { id: 11, episodeId: 5, textRaw: '前後の文もあります。' },
      { id: 12, episodeId: 5, textRaw: '日本語の文です。' },
    ]);
    mockGetStudyGuideByChunkId.mockResolvedValue(null);
    mockSaveStudyGuideForChunkId.mockResolvedValue({
      id: 4,
      chunkId: 12,
      version: 2,
      content: studyGuideFixture,
    });
    mockGenerateStudyGuideFromProvider.mockResolvedValue(studyGuideFixture);
  });

  async function callRoute(id: string) {
    const { GET } = await import('../route');
    const request = new Request(`http://localhost/api/chunks/${id}/study-guide`);

    return GET(request, { params: Promise.resolve({ id }) });
  }

  it('returns 400 for an invalid chunk id', async () => {
    const response = await callRoute('abc');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/invalid chunk id/i);
  });

  it('returns 404 when the chunk is missing', async () => {
    mockGetChunkById.mockResolvedValueOnce(null);

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toMatch(/not found/i);
  });

  it('returns the cached study guide on a cache hit', async () => {
    mockGetStudyGuideByChunkId.mockResolvedValueOnce({
      id: 4,
      chunkId: 12,
      version: 2,
      content: studyGuideFixture,
    });

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(studyGuideFixture);
    expect(mockGenerateStudyGuideFromProvider).not.toHaveBeenCalled();
  });

  it('generates and persists the study guide on a cache miss', async () => {
    mockGenerateStudyGuideFromProvider.mockResolvedValueOnce({
      ...studyGuideFixture,
      vocabulary: [
        {
          id: 'vocab-kaigi',
          japanese: 'かいぎ',
          reading: 'かいぎ',
          dictionaryForm: '会議',
          meaning: 'meeting',
        },
      ],
    });

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      version: 2,
      vocabulary: [
        {
          id: 'vocab-kaigi',
          japanese: '会議',
          reading: 'かいぎ',
          dictionaryForm: '会議',
          meaning: 'meeting',
        },
      ],
      translation: {
        fullEnglish: studyGuideFixture.translation.fullEnglish,
      },
    });
    expect(mockGetChunksByEpisodeId).toHaveBeenCalledWith(5);
    expect(mockGenerateStudyGuideFromProvider).toHaveBeenCalledWith(
      '日本語の文です。',
      '前後の文もあります。\n日本語の文です。'
    );
    expect(mockSaveStudyGuideForChunkId).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        version: 2,
        vocabulary: [
          {
            id: 'vocab-kaigi',
            japanese: '会議',
            reading: 'かいぎ',
            dictionaryForm: '会議',
            meaning: 'meeting',
          },
        ],
        translation: {
          fullEnglish: studyGuideFixture.translation.fullEnglish,
        },
      })
    );
  });

  it('returns 500 when cached study guide content is invalid', async () => {
    mockGetStudyGuideByChunkId.mockResolvedValueOnce({
      id: 4,
      chunkId: 12,
      version: 2,
      content: { ...studyGuideFixture, version: 1 },
    });

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toMatch(/study guide/i);
    expect(mockGenerateStudyGuideFromProvider).not.toHaveBeenCalled();
    expect(mockGetChunksByEpisodeId).not.toHaveBeenCalled();
  });

  it('returns 500 when fetching episode chunks fails', async () => {
    mockGetChunksByEpisodeId.mockRejectedValueOnce(new Error('db connection lost'));

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toMatch(/db connection lost/i);
    expect(mockGenerateStudyGuideFromProvider).not.toHaveBeenCalled();
  });

  it('returns 500 when the provider returns invalid study guide content', async () => {
    mockGenerateStudyGuideFromProvider.mockResolvedValueOnce({
      ...studyGuideFixture,
      translation: null,
    });

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toMatch(/study guide content/i);
    expect(mockSaveStudyGuideForChunkId).not.toHaveBeenCalled();
  });

  it('returns 500 when the provider adapter fails', async () => {
    mockGenerateStudyGuideFromProvider.mockRejectedValueOnce(new Error('provider unavailable'));

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toMatch(/provider unavailable/i);
    expect(mockSaveStudyGuideForChunkId).not.toHaveBeenCalled();
  });

  it('returns 500 when persisting a generated study guide fails', async () => {
    mockSaveStudyGuideForChunkId.mockRejectedValueOnce(new Error('db write failed'));

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toMatch(/db write failed/i);
  });

  it('uses the cached row on a second request after a miss', async () => {
    mockGetStudyGuideByChunkId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 4,
        chunkId: 12,
        version: 2,
        content: studyGuideFixture,
      });

    const firstResponse = await callRoute('12');
    const secondResponse = await callRoute('12');
    const firstJson = await firstResponse.json();
    const secondJson = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstJson.data).toEqual(studyGuideFixture);
    expect(secondJson.data).toEqual(studyGuideFixture);
    expect(mockGenerateStudyGuideFromProvider).toHaveBeenCalledTimes(1);
  });
});
