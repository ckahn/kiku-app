import { describe, it, expect, vi, beforeEach } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

const mockGetSegmentsByEpisodeId = vi.fn();
const mockSaveStudyGuideForSegmentId = vi.fn();
const mockGenerateStudyGuideFromProvider = vi.fn();

vi.mock('@/db/segments', () => ({
  getSegmentsByEpisodeId: mockGetSegmentsByEpisodeId,
}));

vi.mock('@/db/study-guides', () => ({
  saveStudyGuideForSegmentId: mockSaveStudyGuideForSegmentId,
}));

vi.mock('@/lib/api/study-guide-provider', () => ({
  generateStudyGuideFromProvider: mockGenerateStudyGuideFromProvider,
}));

const segment = { id: 12, episodeId: 5, textRaw: '日本語の文です。' };

describe('generateAndSaveStudyGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSegmentsByEpisodeId.mockResolvedValue([
      { id: 11, episodeId: 5, textRaw: '前後の文もあります。' },
      { id: 12, episodeId: 5, textRaw: '日本語の文です。' },
    ]);
    mockGenerateStudyGuideFromProvider.mockResolvedValue(studyGuideFixture);
    mockSaveStudyGuideForSegmentId.mockResolvedValue(undefined);
  });

  it('calls the provider with segment text and last-N episode context', async () => {
    const { generateAndSaveStudyGuide } = await import('../study-guide-service');
    await generateAndSaveStudyGuide(segment as never);

    expect(mockGenerateStudyGuideFromProvider).toHaveBeenCalledWith(
      '日本語の文です。',
      '前後の文もあります。\n日本語の文です。'
    );
  });

  it('saves and returns the parsed, normalized result', async () => {
    const { generateAndSaveStudyGuide } = await import('../study-guide-service');
    const result = await generateAndSaveStudyGuide(segment as never);

    expect(mockSaveStudyGuideForSegmentId).toHaveBeenCalledWith(12, result);
    expect(result).toMatchObject({ version: 2 });
  });

  it('throws when the provider returns invalid content', async () => {
    mockGenerateStudyGuideFromProvider.mockResolvedValueOnce({ ...studyGuideFixture, translation: null });
    const { generateAndSaveStudyGuide } = await import('../study-guide-service');

    await expect(generateAndSaveStudyGuide(segment as never)).rejects.toThrow(/study guide content/i);
    expect(mockSaveStudyGuideForSegmentId).not.toHaveBeenCalled();
  });
});
