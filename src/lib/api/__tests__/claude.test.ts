import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TranscriptChunk, ElevenLabsWord } from '../types';
import { findUnannotatedKanji, unwrapRubyContainingKana } from '../claude';

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

describe('findUnannotatedKanji()', () => {
  it('returns empty array when all kanji are in ruby tags', () => {
    expect(findUnannotatedKanji('<ruby>聞<rt>き</rt></ruby>いて')).toEqual([]);
    expect(findUnannotatedKanji('<ruby>日本語<rt>にほんご</rt></ruby>')).toEqual([]);
  });

  it('returns bare kanji found outside ruby tags', () => {
    expect(findUnannotatedKanji('ポッドキャストを聞いて')).toEqual(['聞']);
    expect(findUnannotatedKanji('勉<ruby>強<rt>きょう</rt></ruby>')).toEqual(['勉']);
  });

  it('returns empty array for text with no kanji', () => {
    expect(findUnannotatedKanji('こんにちは、ポッドキャスト！')).toEqual([]);
    expect(findUnannotatedKanji('テスト')).toEqual([]);
  });

  it('returns multiple missed kanji', () => {
    expect(findUnannotatedKanji('今日は元気ですか')).toEqual(['今', '日', '元', '気']);
  });
});

describe('unwrapRubyContainingKana()', () => {
  it('unwraps ruby tags around katakana-only text', () => {
    expect(
      unwrapRubyContainingKana('<ruby>テスト<rt>てすと</rt></ruby>')
    ).toBe('テスト');
  });

  it('unwraps ruby tags when kana are included in the ruby base text', () => {
    expect(
      unwrapRubyContainingKana('<ruby>聞いて<rt>きいて</rt></ruby>')
    ).toBe('聞いて');
  });

  it('preserves ruby tags when the base text is kanji-only', () => {
    expect(
      unwrapRubyContainingKana('<ruby>日本語<rt>にほんご</rt></ruby>')
    ).toBe('<ruby>日本語<rt>にほんご</rt></ruby>');
  });
});

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

  it('fixture furigana still contains ruby annotations for kanji-bearing chunks', async () => {
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
          { index: 1, text_furigana: 'ポッドキャスト' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const twoChunks: TranscriptChunk[] = [
      { text: 'テスト', first_word_index: 0, last_word_index: 0 },
      { text: 'ポッドキャスト', first_word_index: 1, last_word_index: 1 },
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
          { index: 0, text_furigana: 'テスト' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);

    expect(result[0].text).toBe('テスト');
    expect(result[0].first_word_index).toBe(0);
    expect(result[0].last_word_index).toBe(0);
    expect(result[0].text_furigana).toBe('テスト');
  });

  it('uses the index field to match furigana to chunks, not array position', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    // Claude returns chunks in reverse order (index 1 before index 0)
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 1, text_furigana: 'ポッドキャスト' },
          { index: 0, text_furigana: 'テスト' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const twoChunks: TranscriptChunk[] = [
      { text: 'テスト', first_word_index: 0, last_word_index: 0 },
      { text: 'ポッドキャスト', first_word_index: 1, last_word_index: 1 },
    ];
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(twoChunks);

    expect(result[0].text_furigana).toBe('テスト');
    expect(result[1].text_furigana).toBe('ポッドキャスト');
  });

  it('falls back to raw text when Claude omits a chunk from annotated_chunks', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    // Claude only returns index 0, omits index 1
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, text_furigana: '<ruby>テスト<rt>てすと</rt></ruby>' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const twoChunks: TranscriptChunk[] = [
      { text: 'テスト', first_word_index: 0, last_word_index: 0 },
      { text: 'もう一つ', first_word_index: 1, last_word_index: 1 },
    ];
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(twoChunks);

    expect(result[0].text_furigana).toBe('テスト');
    expect(result[1].text_furigana).toBe('もう一つ'); // raw text fallback, no crash
  });

  it('unwraps katakana ruby added by Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, text_furigana: '<ruby>ポッドキャスト<rt>ぽっどきゃすと</rt></ruby>' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const chunk: TranscriptChunk[] = [
      { text: 'ポッドキャスト', first_word_index: 0, last_word_index: 0 },
    ];
    const result = await addFurigana(chunk);

    expect(result[0].text_furigana).toBe('ポッドキャスト');
  });

  it('unwraps ruby when Claude wraps kanji together with okurigana', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, text_furigana: '<ruby>聞いて<rt>きいて</rt></ruby>' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { addFurigana } = await import('../claude');
    const chunk: TranscriptChunk[] = [
      { text: '聞いて', first_word_index: 0, last_word_index: 0 },
    ];
    const result = await addFurigana(chunk);

    expect(result[0].text_furigana).toBe('聞いて');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('chunk 0 missing furigana for: 聞')
    );
    errorSpy.mockRestore();
  });

  it('logs an error and still returns the chunk when kanji are unannotated', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          // 聞 is bare — not wrapped in a ruby tag
          { index: 0, text_furigana: 'ポッドキャストを聞いて' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const chunk: TranscriptChunk[] = [
      { text: 'ポッドキャストを聞いて', first_word_index: 0, last_word_index: 2 },
    ];
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(chunk);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('chunk 0 missing furigana for: 聞')
    );
    expect(result[0].text_furigana).toBe('ポッドキャストを聞いて');
    errorSpy.mockRestore();
  });

  it('strips disallowed tags from furigana output', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, text_furigana: '<script>alert(1)</script><ruby>漢字<rt>かんじ</rt></ruby>' },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);

    expect(result[0].text_furigana).not.toContain('<script>');
    expect(result[0].text_furigana).toContain('<ruby>');
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
