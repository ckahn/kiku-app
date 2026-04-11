import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mocked-anthropic-model')),
}));

describe('study guide provider adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses a valid provider response into study guide content', async () => {
    const { parseStudyGuideProviderResponse } = await import('../study-guide-provider');

    expect(
      parseStudyGuideProviderResponse({
        object: studyGuideFixture,
      })
    ).toEqual(studyGuideFixture);
  });

  it('rejects provider responses with invalid study guide content', async () => {
    const { parseStudyGuideProviderResponse } = await import('../study-guide-provider');

    expect(() =>
      parseStudyGuideProviderResponse({
        object: {
          ...studyGuideFixture,
          translation: null,
        },
      })
    ).toThrow(/provider response/i);
  });

  it('rejects invalid provider requests', async () => {
    const { parseStudyGuideProviderRequest } = await import('../study-guide-provider');

    expect(() =>
      parseStudyGuideProviderRequest({
        chunkText: '',
        transcriptText: '文脈です。',
      })
    ).toThrow(/provider request/i);
  });

  it('requires transcript context in provider requests', async () => {
    const { parseStudyGuideProviderRequest } = await import('../study-guide-provider');

    expect(() =>
      parseStudyGuideProviderRequest({
        chunkText: '日本語の文です。',
        transcriptText: '',
      })
    ).toThrow(/provider request/i);
  });

  it('returns parsed study guide content from the fake provider in mock mode', async () => {
    vi.stubEnv('USE_MOCKS', 'true');
    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(
      generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。')
    ).resolves.toEqual(studyGuideFixture);
  });

  it('throws when ANTHROPIC_API_KEY is not configured in real mode', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(
      generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。')
    ).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured'
    );
  });

  it('returns parsed study guide content from Claude in real mode', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: studyGuideFixture,
    } as Awaited<ReturnType<typeof generateObject>>);

    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(
      generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。')
    ).resolves.toEqual(studyGuideFixture);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed Claude output at the provider boundary', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        ...studyGuideFixture,
        translation: null,
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(
      generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。')
    ).rejects.toThrow(
      /provider response/i
    );
  });
});
