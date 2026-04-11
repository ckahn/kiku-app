import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChunkWithFurigana, ElevenLabsWord } from '@/lib/api/types';

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn().mockResolvedValue([]);

vi.mock('@/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
}));

vi.mock('@/db/schema', () => ({
  chunks: { episodeId: 'episodeId', chunkIndex: 'chunkIndex' },
}));

const SAMPLE_WORDS: ElevenLabsWord[] = [
  { text: 'おはよう', startSecond: 0.0, endSecond: 0.5 },
  { text: 'ございます', startSecond: 0.6, endSecond: 1.2 },
  { text: '今日も', startSecond: 1.5, endSecond: 2.0 },
];

const SAMPLE_CHUNKS: ChunkWithFurigana[] = [
  {
    text: 'おはようございます',
    text_furigana: 'おはようございます',
    first_word_index: 0,
    last_word_index: 1,
    furigana_status: 'ok',
    furigana_warning: null,
  },
  {
    text: '今日も',
    text_furigana: '<ruby>今日<rt>きょう</rt></ruby>も',
    first_word_index: 2,
    last_word_index: 2,
    furigana_status: 'ok',
    furigana_warning: null,
  },
];

describe('insertChunks()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  });

  it('calls db.insert with the chunks table', async () => {
    const { insertChunks } = await import('../chunks');
    await insertChunks(42, SAMPLE_CHUNKS, SAMPLE_WORDS);
    expect(mockInsert).toHaveBeenCalledWith({ episodeId: 'episodeId', chunkIndex: 'chunkIndex' });
  });

  it('computes startMs and endMs from word timestamps', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, SAMPLE_CHUNKS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].startMs).toBe(0);    // 0.0s * 1000
    expect(rows[0][0].endMs).toBe(1500);   // gap-filled to chunk 1 startMs (1.5s)
    expect(rows[0][1].startMs).toBe(1500); // 1.5s * 1000
    expect(rows[0][1].endMs).toBe(2000);   // last chunk — no gap-fill
  });

  it('extends endMs to next chunk startMs when there is a gap', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    // word[1] ends at 1.0s but word[2] starts at 2.0s — 1s gap
    const words: ElevenLabsWord[] = [
      { text: 'A', startSecond: 0.0, endSecond: 0.5 },
      { text: 'B', startSecond: 0.6, endSecond: 1.0 },
      { text: 'C', startSecond: 2.0, endSecond: 2.5 },
    ];
    const chunkData: ChunkWithFurigana[] = [
      { text: 'AB', text_furigana: 'AB', first_word_index: 0, last_word_index: 1, furigana_status: 'ok', furigana_warning: null },
      { text: 'C',  text_furigana: 'C',  first_word_index: 2, last_word_index: 2, furigana_status: 'ok', furigana_warning: null },
    ];

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, chunkData, words);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].endMs).toBe(2000); // gap-filled: chunk 1 startMs = 2.0s
    expect(rows[0][1].endMs).toBe(2500); // last chunk — no gap-fill
  });

  it('does not extend endMs when chunks are contiguous', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    // word[1] ends at 1.0s and word[2] starts at 1.0s — no gap
    const words: ElevenLabsWord[] = [
      { text: 'A', startSecond: 0.0, endSecond: 0.5 },
      { text: 'B', startSecond: 0.6, endSecond: 1.0 },
      { text: 'C', startSecond: 1.0, endSecond: 1.5 },
    ];
    const chunkData: ChunkWithFurigana[] = [
      { text: 'AB', text_furigana: 'AB', first_word_index: 0, last_word_index: 1, furigana_status: 'ok', furigana_warning: null },
      { text: 'C',  text_furigana: 'C',  first_word_index: 2, last_word_index: 2, furigana_status: 'ok', furigana_warning: null },
    ];

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, chunkData, words);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].endMs).toBe(1000); // no gap — stays at wordEndMs
  });

  it('sets chunkIndex as the array position', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, SAMPLE_CHUNKS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].chunkIndex).toBe(0);
    expect(rows[0][1].chunkIndex).toBe(1);
  });

  it('builds sentences JSONB with one entry per chunk', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, SAMPLE_CHUNKS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    const firstSentences = rows[0][0].sentences as { text: string; start_ms: number; end_ms: number }[];
    expect(firstSentences).toHaveLength(1);
    expect(firstSentences[0].text).toBe('おはようございます');
    expect(firstSentences[0].start_ms).toBe(0);
    expect(firstSentences[0].end_ms).toBe(1500); // gap-filled to chunk 1 startMs
  });

  it('stores episodeId on each row', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, SAMPLE_CHUNKS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].episodeId).toBe(42);
    expect(rows[0][1].episodeId).toBe(42);
  });

  it('persists furigana status and warning fields', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertChunks } = await import('../chunks');
    await insertChunks(42, [
      {
        text: '日本',
        text_furigana: '<ruby>日<rt>にほん</rt></ruby><ruby>本<rt>ほん</rt></ruby>',
        first_word_index: 0,
        last_word_index: 0,
        furigana_status: 'suspect',
        furigana_warning: 'This furigana may contain mistakes.',
      },
    ], SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].furiganaStatus).toBe('suspect');
    expect(rows[0][0].furiganaWarning).toBe('This furigana may contain mistakes.');
  });

  it('throws a clear error when first_word_index is out of bounds', async () => {
    const { insertChunks } = await import('../chunks');
    const badChunk: ChunkWithFurigana[] = [{
      text: 'テスト',
      text_furigana: 'テスト',
      first_word_index: 99, // out of bounds
      last_word_index: 99,
      furigana_status: 'ok',
      furigana_warning: null,
    }];
    await expect(insertChunks(42, badChunk, SAMPLE_WORDS)).rejects.toThrow(
      'out-of-bounds'
    );
  });

  it('throws a clear error when last_word_index is out of bounds', async () => {
    const { insertChunks } = await import('../chunks');
    const badChunk: ChunkWithFurigana[] = [{
      text: 'テスト',
      text_furigana: 'テスト',
      first_word_index: 0,
      last_word_index: 99, // out of bounds
      furigana_status: 'ok',
      furigana_warning: null,
    }];
    await expect(insertChunks(42, badChunk, SAMPLE_WORDS)).rejects.toThrow(
      'out-of-bounds'
    );
  });
});

describe('getChunksByEpisodeId()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it('calls db.select and filters by episodeId', async () => {
    const { getChunksByEpisodeId } = await import('../chunks');
    await getChunksByEpisodeId(7);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it('orders by chunkIndex ascending', async () => {
    const { getChunksByEpisodeId } = await import('../chunks');
    await getChunksByEpisodeId(7);
    expect(mockOrderBy).toHaveBeenCalled();
  });

  it('returns the result from db', async () => {
    const fakeChunks = [
      { id: 1, chunkIndex: 0, furiganaStatus: 'ok', furiganaWarning: null },
      { id: 2, chunkIndex: 1, furiganaStatus: 'suspect', furiganaWarning: 'warn' },
    ];
    mockOrderBy.mockResolvedValueOnce(fakeChunks);

    const { getChunksByEpisodeId } = await import('../chunks');
    const result = await getChunksByEpisodeId(7);
    expect(result).toEqual(fakeChunks);
  });
});

describe('getChunkById()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('returns null when the chunk does not exist', async () => {
    const { getChunkById } = await import('../chunks');

    await expect(getChunkById(99)).resolves.toBeNull();
  });

  it('returns the matching chunk when it exists', async () => {
    const fakeChunk = {
      id: 8,
      episodeId: 3,
      chunkIndex: 2,
      textRaw: '日本語です',
      textFurigana: '日本語です',
      furiganaStatus: 'ok',
      furiganaWarning: null,
      startMs: 1000,
      endMs: 2000,
      sentences: [],
      createdAt: new Date(),
    };
    mockWhere.mockResolvedValueOnce([fakeChunk]);

    const { getChunkById } = await import('../chunks');

    await expect(getChunkById(8)).resolves.toEqual(fakeChunk);
  });
});

describe('getChunkByEpisodeIdAndIndex()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('returns null when the chunk does not exist for the episode', async () => {
    const { getChunkByEpisodeIdAndIndex } = await import('../chunks');

    await expect(getChunkByEpisodeIdAndIndex(3, 9)).resolves.toBeNull();
  });

  it('returns the matching chunk when the episode and chunk index exist', async () => {
    const fakeChunk = {
      id: 12,
      episodeId: 3,
      chunkIndex: 1,
      textRaw: '勉強します。',
      textFurigana: '勉強します。',
      furiganaStatus: 'ok',
      furiganaWarning: null,
      startMs: 1000,
      endMs: 2400,
      sentences: [],
      createdAt: new Date(),
    };
    mockWhere.mockResolvedValueOnce([fakeChunk]);

    const { getChunkByEpisodeIdAndIndex } = await import('../chunks');

    await expect(getChunkByEpisodeIdAndIndex(3, 1)).resolves.toEqual(fakeChunk);
  });
});
