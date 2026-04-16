import { describe, it, expect, vi, beforeEach } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

const mockGetChunksByEpisodeId = vi.fn();
const mockSaveStudyGuideForChunkId = vi.fn();
const mockGenerateStudyGuideFromProvider = vi.fn();

vi.mock('@/db/chunks', () => ({
  getChunksByEpisodeId: mockGetChunksByEpisodeId,
}));

vi.mock('@/db/study-guides', () => ({
  saveStudyGuideForChunkId: mockSaveStudyGuideForChunkId,
}));

vi.mock('@/lib/api/study-guide-provider', () => ({
  generateStudyGuideFromProvider: mockGenerateStudyGuideFromProvider,
}));

const chunk = { id: 12, episodeId: 5, textRaw: '日本語の文です。' };

describe('generateAndSaveStudyGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChunksByEpisodeId.mockResolvedValue([
      { id: 11, episodeId: 5, textRaw: '前後の文もあります。' },
      { id: 12, episodeId: 5, textRaw: '日本語の文です。' },
    ]);
    mockGenerateStudyGuideFromProvider.mockResolvedValue(studyGuideFixture);
    mockSaveStudyGuideForChunkId.mockResolvedValue(undefined);
  });

  it('calls the provider with chunk text and last-N episode context', async () => {
    const { generateAndSaveStudyGuide } = await import('../study-guide-service');
    await generateAndSaveStudyGuide(chunk as never);

    expect(mockGenerateStudyGuideFromProvider).toHaveBeenCalledWith(
      '日本語の文です。',
      '前後の文もあります。\n日本語の文です。'
    );
  });

  it('saves and returns the parsed, normalized result', async () => {
    const { generateAndSaveStudyGuide } = await import('../study-guide-service');
    const result = await generateAndSaveStudyGuide(chunk as never);

    expect(mockSaveStudyGuideForChunkId).toHaveBeenCalledWith(12, result);
    expect(result).toMatchObject({ version: 2 });
  });

  it('throws when the provider returns invalid content', async () => {
    mockGenerateStudyGuideFromProvider.mockResolvedValueOnce({ ...studyGuideFixture, translation: null });
    const { generateAndSaveStudyGuide } = await import('../study-guide-service');

    await expect(generateAndSaveStudyGuide(chunk as never)).rejects.toThrow(/study guide content/i);
    expect(mockSaveStudyGuideForChunkId).not.toHaveBeenCalled();
  });
});
