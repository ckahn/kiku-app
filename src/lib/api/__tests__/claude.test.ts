import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ElevenLabsWord, TranscriptChunk } from '../types';
import { findUnannotatedKanji } from '../claude';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mocked-anthropic-model')),
}));

const DUMMY_WORDS: ElevenLabsWord[] = [
  { text: '日本語', startSecond: 0, endSecond: 0.5 },
];

const DUMMY_CHUNKS: TranscriptChunk[] = [
  { text: '日本語', first_word_index: 0, last_word_index: 0 },
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
      expect(entry).toHaveProperty('furigana_status');
      expect(entry).toHaveProperty('furigana_warning');
    }
  });

  it('fixture furigana still contains ruby annotations for kanji-bearing chunks', async () => {
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);
    for (const entry of result) {
      expect(entry.text_furigana).toContain('<ruby');
      expect(entry.furigana_status).toBe('ok');
      expect(entry.furigana_warning).toBeNull();
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

  it('renders structured spans into ruby html', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, spans: [{ surface: '日本語', reading: 'にほんご' }] },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);

    expect(result[0].text).toBe('日本語');
    expect(result[0].first_word_index).toBe(0);
    expect(result[0].last_word_index).toBe(0);
    expect(result[0].text_furigana).toBe('<ruby>日本語<rt>にほんご</rt></ruby>');
    expect(result[0].furigana_status).toBe('ok');
    expect(result[0].furigana_warning).toBeNull();
  });

  it('calls generateObject once for clean output', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, spans: [{ surface: '日本語', reading: 'にほんご' }] },
          { index: 1, spans: [{ surface: '会議', reading: 'かいぎ' }] },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    await addFurigana([
      { text: '日本語', first_word_index: 0, last_word_index: 0 },
      { text: '会議', first_word_index: 1, last_word_index: 1 },
    ]);

    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('keeps kana-only spans as plain text', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, spans: [{ surface: 'テスト', reading: null }] },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: 'テスト', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].text_furigana).toBe('テスト');
    expect(result[0].furigana_status).toBe('ok');
  });

  it('uses the index field to match annotations to chunks, not array order', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const twoChunks: TranscriptChunk[] = [
      { text: '日本', first_word_index: 0, last_word_index: 0 },
      { text: '会議', first_word_index: 1, last_word_index: 1 },
    ];

    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 1, spans: [{ surface: '会議', reading: 'かいぎ' }] },
          { index: 0, spans: [{ surface: '日本', reading: 'にほん' }] },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana(twoChunks);

    expect(result[0].text_furigana).toBe('<ruby>日本<rt>にほん</rt></ruby>');
    expect(result[1].text_furigana).toBe('<ruby>会議<rt>かいぎ</rt></ruby>');
  });

  it('marks a chunk suspect when no annotation is returned', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: { annotated_chunks: [] },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: { annotated_chunks: [] },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result[0].text_furigana).toBe('日本語');
    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/retry did not return any furigana spans/i);
  });

  it('retries once when the first pass fails validation and marks ok when retry passes', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            // First pass: kanji span missing its reading
            { index: 0, spans: [{ surface: '日本', reading: null }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '日本', reading: 'にほん' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '日本', first_word_index: 0, last_word_index: 0 }]);

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result[0].text_furigana).toBe('<ruby>日本<rt>にほん</rt></ruby>');
    expect(result[0].furigana_status).toBe('ok');
  });

  it('marks kana-only spans with readings as suspicious', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: 'テスト', reading: 'てすと' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: 'テスト', reading: 'てすと' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: 'テスト', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].text_furigana).toBe('テスト');
    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/kana-only span "テスト" should have reading=null/i);
  });

  it('marks unsplit okurigana spans as suspicious', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '聞いて', reading: 'きいて' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '聞いて', reading: 'きいて' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '聞いて', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].text_furigana).toBe('<ruby>聞いて<rt>きいて</rt></ruby>');
    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/must be kanji-only/i);
  });

  it('accepts digit+kanji date/counter compounds with readings', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          {
            index: 0,
            spans: [
              { surface: '4月', reading: 'しがつ' },
              { surface: '1日', reading: 'ついたち' },
              { surface: 'です。', reading: null },
            ],
          },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '4月1日です。', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].text_furigana).toBe(
      '<ruby>4月<rt>しがつ</rt></ruby><ruby>1日<rt>ついたち</rt></ruby>です。'
    );
    expect(result[0].furigana_status).toBe('ok');
    expect(result[0].furigana_warning).toBeNull();
  });

  it('accepts irregular day readings as digit+kanji compounds', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, spans: [{ surface: '20日', reading: 'はつか' }] },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '20日', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].text_furigana).toBe('<ruby>20日<rt>はつか</rt></ruby>');
    expect(result[0].furigana_status).toBe('ok');
  });

  it('rejects digit+kanji compounds with 3+ digit prefixes', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '355432円', reading: 'さんびゃくごじゅうごまんよんせんさんびゃくさんじゅうにえん' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '355432円', reading: 'さんびゃくごじゅうごまんよんせんさんびゃくさんじゅうにえん' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '355432円', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/must be kanji-only/i);
  });

  it('marks Latin+kanji mixed surfaces as suspicious', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: 'abc漢字', reading: 'えーびーしーかんじ' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: 'abc漢字', reading: 'えーびーしーかんじ' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: 'abc漢字', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/must be kanji-only/i);
  });

  it('sanitizes script tags in rendered furigana output', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        annotated_chunks: [
          { index: 0, spans: [{ surface: '漢字', reading: '<script>alert(1)</script>' }] },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '漢字', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].text_furigana).not.toContain('<script>');
    expect(result[0].text_furigana).toContain('<ruby>漢字');
  });

  it('keeps suspicious output with a warning when retry still fails validation', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    // Both passes return a span whose surfaces don't reconstruct the original text
    const badSpans = [{ surface: '日本語', reading: 'にほんご' }];
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: { annotated_chunks: [{ index: 0, spans: badSpans }] },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: { annotated_chunks: [{ index: 0, spans: badSpans }] },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '日本', first_word_index: 0, last_word_index: 0 }]);

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/may contain mistakes/i);
  });

  it('marks malformed spans suspect when they do not reconstruct the original text', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '日本', reading: 'にほん' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            { index: 0, spans: [{ surface: '日本', reading: 'にほん' }] },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '日本語', first_word_index: 0, last_word_index: 0 }]);

    expect(result[0].furigana_status).toBe('suspect');
    expect(result[0].furigana_warning).toMatch(/reconstruct/i);
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
