import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

describe('study guide provider adapter', () => {
  beforeEach(() => {
    vi.resetModules();
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
      })
    ).toThrow(/provider request/i);
  });

  it('returns parsed study guide content from the fake provider in mock mode', async () => {
    vi.stubEnv('USE_MOCKS', 'true');
    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(generateStudyGuideFromProvider('日本語の文です。')).resolves.toEqual(studyGuideFixture);
  });

  it('throws clearly when the real provider is not implemented', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(generateStudyGuideFromProvider('日本語の文です。')).rejects.toThrow(
      'Real study guide provider not yet implemented'
    );
  });
});
