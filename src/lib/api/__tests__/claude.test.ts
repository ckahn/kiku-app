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

  it('adds default furigana status metadata in mock mode', async () => {
    const { addFurigana } = await import('../claude');
    const result = await addFurigana(DUMMY_CHUNKS);
    expect(result[0].furigana_status).toBe('ok');
    expect(result[0].furigana_warning).toBeNull();
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

    expect(result[0].text_furigana).toBe('<ruby>日本語<rt>にほんご</rt></ruby>');
    expect(result[0].furigana_status).toBe('ok');
    expect(result[0].furigana_warning).toBeNull();
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

  it('retries once when the first pass has suspicious compound splitting', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            {
              index: 0,
              spans: [
                { surface: '日', reading: 'にほん' },
                { surface: '本', reading: 'ほん' },
              ],
            },
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

  it('keeps suspicious output with a warning when retry still looks wrong', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            {
              index: 0,
              spans: [
                { surface: '日', reading: 'にほん' },
                { surface: '本', reading: 'ほん' },
              ],
            },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: {
          annotated_chunks: [
            {
              index: 0,
              spans: [
                { surface: '日', reading: 'にほん' },
                { surface: '本', reading: 'ほん' },
              ],
            },
          ],
        },
      } as Awaited<ReturnType<typeof generateObject>>);

    const { addFurigana } = await import('../claude');
    const result = await addFurigana([{ text: '日本', first_word_index: 0, last_word_index: 0 }]);

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result[0].text_furigana).toBe('<ruby>日<rt>にほん</rt></ruby><ruby>本<rt>ほん</rt></ruby>');
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
