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

  it('rejects invalid provider requests', async () => {
    const { parseStudyGuideProviderRequest } = await import('../study-guide-provider');

    expect(() =>
      parseStudyGuideProviderRequest({
        chunkText: '',
        contextText: '文脈です。',
      })
    ).toThrow(/provider request/i);
  });

  it('requires context text in provider requests', async () => {
    const { parseStudyGuideProviderRequest } = await import('../study-guide-provider');

    expect(() =>
      parseStudyGuideProviderRequest({
        chunkText: '日本語の文です。',
        contextText: '',
      })
    ).toThrow(/provider request/i);
  });

  it('returns study guide content from the fake provider in mock mode', async () => {
    vi.stubEnv('USE_MOCKS', 'true');
    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(
      generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。')
    ).resolves.toMatchObject({
      version: 2,
      vocabulary: expect.arrayContaining([
        expect.objectContaining({
          id: studyGuideFixture.vocabulary[0].id,
          japanese: studyGuideFixture.vocabulary[0].japanese,
          meaning: studyGuideFixture.vocabulary[0].meaning,
        }),
      ]),
      structures: expect.arrayContaining([
        expect.objectContaining({
          id: studyGuideFixture.structures[0].id,
          pattern: studyGuideFixture.structures[0].pattern,
          meaning: studyGuideFixture.structures[0].meaning,
        }),
      ]),
      breakdown: expect.arrayContaining([
        expect.objectContaining({
          id: studyGuideFixture.breakdown[0].id,
          japanese: studyGuideFixture.breakdown[0].japanese,
          cue: studyGuideFixture.breakdown[0].cue,
        }),
      ]),
      translation: {
        fullEnglish: studyGuideFixture.translation.fullEnglish,
      },
    });
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

  it('returns study guide content from Claude in real mode', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: studyGuideFixture,
    } as Awaited<ReturnType<typeof generateObject>>);

    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await expect(
      generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。')
    ).resolves.toMatchObject({
      version: 2,
      translation: {
        fullEnglish: studyGuideFixture.translation.fullEnglish,
      },
    });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateObject).mock.calls[0]?.[0].prompt).toContain('partOfSpeech');
  });

  it('tells Claude to ignore English-language material in the prompt', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: studyGuideFixture,
    } as Awaited<ReturnType<typeof generateObject>>);

    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await generateStudyGuideFromProvider('日本語の文です。', 'English context mixed with 日本語。');

    const prompt = vi.mocked(generateObject).mock.calls[0]?.[0].prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt).toMatch(/Ignore English-language material/i);
    expect(prompt).toMatch(/Only derive study items from Japanese text/i);
  });

  it('tells Claude to preserve kanji spellings for vocabulary items', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: studyGuideFixture,
    } as Awaited<ReturnType<typeof generateObject>>);

    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await generateStudyGuideFromProvider('日本語の文です。', '日本語の文です。前後の文もあります。');

    const prompt = vi.mocked(generateObject).mock.calls[0]?.[0].prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('original kanji spelling');
  });

  it('tells Claude to keep vocabulary in dictionary form and move conjugations to grammar', async () => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: studyGuideFixture,
    } as Awaited<ReturnType<typeof generateObject>>);

    const { generateStudyGuideFromProvider } = await import('../study-guide-provider');

    await generateStudyGuideFromProvider('食べたりする。', '前後の文もあります。');

    const prompt = vi.mocked(generateObject).mock.calls[0]?.[0].prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('do not include conjugated surface forms like 食べたり in vocabulary');
    expect(prompt).toContain('Put conjugations and usage notes for inflected forms like 食べたり in structures instead of vocabulary');
  });
});
