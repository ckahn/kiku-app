import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TranscriptChunk, ElevenLabsWord } from '../types';

// Top-level mocks — hoisted so they apply to all dynamic imports below.
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mocked-anthropic-model')),
}));

const DUMMY_WORDS: ElevenLabsWord[] = [
  { text: 'テスト', startSecond: 0, endSecond: 0.5 },
];

const DUMMY_CHUNKS: TranscriptChunk[] = [
  { text: 'テスト', first_word_index: 0, last_word_index: 0 },
];

describe('chunkTranscript() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an array of chunks with required fields', async () => {
    const { chunkTranscript } = await import('../claude');
    const result = await chunkTranscript('テスト', DUMMY_WORDS);
    expect(Array.isArray(result)).toBe(true);
    for (const chunk of result) {
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('first_word_index');
      expect(chunk).toHaveProperty('last_word_index');
    }
  });

  it('does not mutate the input words array', async () => {
    const { chunkTranscript } = await import('../claude');
    const inputWords = [...DUMMY_WORDS];
    await chunkTranscript('テスト', inputWords);
    expect(inputWords).toStrictEqual(DUMMY_WORDS);
  });
});

describe('addFurigana() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the same number of entries as input chunks', async () => {
    const { chunkTranscript, addFurigana } = await import('../claude');
    const chunks = await chunkTranscript('', DUMMY_WORDS);
    const result = await addFurigana(chunks);
    expect(result.length).toBe(chunks.length);
  });

  it('each result has text, text_furigana, first_word_index, last_word_index', async () => {
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);
    for (const entry of result) {
      expect(entry).toHaveProperty('text');
      expect(entry).toHaveProperty('text_furigana');
      expect(entry).toHaveProperty('first_word_index');
      expect(entry).toHaveProperty('last_word_index');
    }
  });

  it('each text_furigana contains at least one <ruby> annotation', async () => {
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);
    for (const entry of result) {
      expect(entry.text_furigana).toContain('<ruby');
    }
  });

  it('does not mutate the input chunks array', async () => {
    const { addFurigana } = await import('../claude');
    const inputChunks = [...DUMMY_CHUNKS];
    await addFurigana(inputChunks);
    expect(inputChunks).toStrictEqual(DUMMY_CHUNKS);
  });
});

describe('generateDrilldown() — mock mode', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an object with a non-empty sentences array', async () => {
    const { generateDrilldown } = await import('../claude');
    const result = await generateDrilldown('テスト');
    expect(result).toHaveProperty('sentences');
    expect(Array.isArray(result.sentences)).toBe(true);
    expect(result.sentences.length).toBeGreaterThan(0);
  });

  it('each sentence has japanese, english, and structures', async () => {
    const { generateDrilldown } = await import('../claude');
    const result = await generateDrilldown('テスト');
    for (const sentence of result.sentences) {
      expect(sentence).toHaveProperty('japanese');
      expect(sentence).toHaveProperty('english');
      expect(sentence).toHaveProperty('structures');
    }
  });
});

describe('chunkTranscript() — real API', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('throws when ANTHROPIC_API_KEY is not configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { chunkTranscript } = await import('../claude');
    await expect(chunkTranscript('テスト', DUMMY_WORDS)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured'
    );
  });

  it('calls generateObject and returns parsed chunks', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { chunks: [{ text: 'テスト', first_word_index: 0, last_word_index: 0 }] },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { chunkTranscript } = await import('../claude');
    const result = await chunkTranscript('テスト', DUMMY_WORDS);

    expect(generateObject).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ text: 'テスト', first_word_index: 0, last_word_index: 0 });
  });
});

describe('addFurigana() — real API', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('throws when ANTHROPIC_API_KEY is not configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { addFurigana } = await import('../claude');
    await expect(addFurigana(DUMMY_CHUNKS)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured'
    );
  });

  it('calls generateObject once for all chunks', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, text_furigana: 'テスト' },
          { index: 1, text_furigana: 'もう一つ' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const twoChunks: TranscriptChunk[] = [
      { text: 'テスト', first_word_index: 0, last_word_index: 0 },
      { text: 'もう一つ', first_word_index: 1, last_word_index: 1 },
    ];
    const { addFurigana } = await import('../claude');
    await addFurigana(twoChunks);

    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('preserves text, first_word_index, and last_word_index from input', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, text_furigana: '<ruby>テスト<rt>てすと</rt></ruby>' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);

    expect(result[0].text).toBe('テスト');
    expect(result[0].first_word_index).toBe(0);
    expect(result[0].last_word_index).toBe(0);
    expect(result[0].text_furigana).toBe('<ruby>テスト<rt>てすと</rt></ruby>');
  });
});

describe('generateDrilldown() — non-mock mode stub', () => {
  beforeEach(() => {
    vi.stubEnv('USE_MOCKS', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws with clear message', async () => {
    const { generateDrilldown } = await import('../claude');
    await expect(generateDrilldown('')).rejects.toThrow(
      'Real Claude API not yet implemented'
    );
  });
});
