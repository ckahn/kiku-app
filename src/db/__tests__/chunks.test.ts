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
  },
  {
    text: '今日も',
    text_furigana: '<ruby>今日<rt>きょう</rt></ruby>も',
    first_word_index: 2,
    last_word_index: 2,
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
    expect(rows[0][0].startMs).toBe(0);   // 0.0s * 1000
    expect(rows[0][0].endMs).toBe(1200);  // 1.2s * 1000
    expect(rows[0][1].startMs).toBe(1500); // 1.5s * 1000
    expect(rows[0][1].endMs).toBe(2000);   // 2.0s * 1000
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
    expect(firstSentences[0].end_ms).toBe(1200);
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

  it('throws a clear error when first_word_index is out of bounds', async () => {
    const { insertChunks } = await import('../chunks');
    const badChunk: ChunkWithFurigana[] = [{
      text: 'テスト',
      text_furigana: 'テスト',
      first_word_index: 99, // out of bounds
      last_word_index: 99,
    }];
    await expect(insertChunks(42, badChunk, SAMPLE_WORDS)).rejects.toThrow(
      'out-of-bounds word indices'
    );
  });

  it('throws a clear error when last_word_index is out of bounds', async () => {
    const { insertChunks } = await import('../chunks');
    const badChunk: ChunkWithFurigana[] = [{
      text: 'テスト',
      text_furigana: 'テスト',
      first_word_index: 0,
      last_word_index: 99, // out of bounds
    }];
    await expect(insertChunks(42, badChunk, SAMPLE_WORDS)).rejects.toThrow(
      'out-of-bounds word indices'
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
    const fakeChunks = [{ id: 1, chunkIndex: 0 }, { id: 2, chunkIndex: 1 }];
    mockOrderBy.mockResolvedValueOnce(fakeChunks);

    const { getChunksByEpisodeId } = await import('../chunks');
    const result = await getChunksByEpisodeId(7);
    expect(result).toEqual(fakeChunks);
  });
});
