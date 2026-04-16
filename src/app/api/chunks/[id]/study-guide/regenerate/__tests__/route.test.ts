import { beforeEach, describe, expect, it, vi } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

const mockGetChunkById = vi.fn();
const mockGetChunksByEpisodeId = vi.fn();
const mockSaveStudyGuideForChunkId = vi.fn();
const mockGenerateStudyGuideFromProvider = vi.fn();

vi.mock('@/db/chunks', () => ({
  getChunkById: mockGetChunkById,
  getChunksByEpisodeId: mockGetChunksByEpisodeId,
}));

vi.mock('@/db/study-guides', () => ({
  saveStudyGuideForChunkId: mockSaveStudyGuideForChunkId,
}));

vi.mock('@/lib/api/study-guide-provider', () => ({
  generateStudyGuideFromProvider: mockGenerateStudyGuideFromProvider,
}));

describe('POST /api/chunks/[id]/study-guide/regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChunkById.mockResolvedValue({ id: 12, episodeId: 5, textRaw: '日本語の文です。' });
    mockGetChunksByEpisodeId.mockResolvedValue([
      { id: 11, episodeId: 5, textRaw: '前後の文もあります。' },
      { id: 12, episodeId: 5, textRaw: '日本語の文です。' },
    ]);
    mockGenerateStudyGuideFromProvider.mockResolvedValue(studyGuideFixture);
    mockSaveStudyGuideForChunkId.mockResolvedValue({
      id: 4,
      chunkId: 12,
      version: 2,
      content: studyGuideFixture,
    });
  });

  async function callRoute(id: string) {
    const { POST } = await import('../route');
    const request = new Request(`http://localhost/api/chunks/${id}/study-guide/regenerate`, {
      method: 'POST',
    });

    return POST(request, { params: Promise.resolve({ id }) });
  }

  it('regenerates and persists the study guide for a valid chunk', async () => {
    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(studyGuideFixture);
    expect(mockGenerateStudyGuideFromProvider).toHaveBeenCalledWith(
      '日本語の文です。',
      '前後の文もあります。\n日本語の文です。'
    );
    expect(mockSaveStudyGuideForChunkId).toHaveBeenCalledWith(12, studyGuideFixture);
  });

  it('returns 404 when the chunk is missing', async () => {
    mockGetChunkById.mockResolvedValueOnce(null);

    const response = await callRoute('12');
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 500 when the regenerated content is invalid', async () => {
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
});
