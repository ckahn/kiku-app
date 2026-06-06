import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  SegmentWithFurigana,
  ElevenLabsWord,
  TranscriptSentence,
} from '@/lib/api/types';

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn().mockResolvedValue([]);
const mockLimit = vi.fn();

vi.mock('@/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/db/schema', () => ({
  segments: { id: 'id', episodeId: 'episodeId', segmentIndex: 'segmentIndex', studyStatus: 'studyStatus' },
  episodes: { id: 'episodeId', status: 'status', podcastId: 'podcastId' },
  podcasts: { id: 'podcastId', slug: 'slug', name: 'name' },
}));

const SAMPLE_WORDS: ElevenLabsWord[] = [
  { text: 'おはよう', startSecond: 0.0, endSecond: 0.5 },
  { text: 'ございます', startSecond: 0.6, endSecond: 1.2 },
  { text: '今日も', startSecond: 1.5, endSecond: 2.0 },
];

const SAMPLE_SEGMENTS: SegmentWithFurigana[] = [
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

type SegmentInsertInput = SegmentWithFurigana & {
  readonly sentences?: readonly TranscriptSentence[];
};

describe('insertSegments()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  });

  it('calls db.insert with the segments table', async () => {
    const { insertSegments } = await import('../segments');
    await insertSegments(42, SAMPLE_SEGMENTS, SAMPLE_WORDS);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ episodeId: 'episodeId', segmentIndex: 'segmentIndex' }));
  });

  it('computes startMs and endMs from word timestamps', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertSegments } = await import('../segments');
    await insertSegments(42, SAMPLE_SEGMENTS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].startMs).toBe(0);    // 0.0s * 1000
    expect(rows[0][0].endMs).toBe(1500);   // gap-filled to segment 1 startMs (1.5s)
    expect(rows[0][1].startMs).toBe(1500); // 1.5s * 1000
    expect(rows[0][1].endMs).toBe(2000);   // last segment — no gap-fill
  });

  it('extends endMs to next segment startMs when there is a gap', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    // word[1] ends at 1.0s but word[2] starts at 2.0s — 1s gap
    const words: ElevenLabsWord[] = [
      { text: 'A', startSecond: 0.0, endSecond: 0.5 },
      { text: 'B', startSecond: 0.6, endSecond: 1.0 },
      { text: 'C', startSecond: 2.0, endSecond: 2.5 },
    ];
    const segmentData: SegmentWithFurigana[] = [
      { text: 'AB', text_furigana: 'AB', first_word_index: 0, last_word_index: 1, furigana_status: 'ok', furigana_warning: null },
      { text: 'C',  text_furigana: 'C',  first_word_index: 2, last_word_index: 2, furigana_status: 'ok', furigana_warning: null },
    ];

    const { insertSegments } = await import('../segments');
    await insertSegments(42, segmentData, words);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].endMs).toBe(2000); // gap-filled: segment 1 startMs = 2.0s
    expect(rows[0][1].endMs).toBe(2500); // last segment — no gap-fill
  });

  it('does not extend endMs when segments are contiguous', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    // word[1] ends at 1.0s and word[2] starts at 1.0s — no gap
    const words: ElevenLabsWord[] = [
      { text: 'A', startSecond: 0.0, endSecond: 0.5 },
      { text: 'B', startSecond: 0.6, endSecond: 1.0 },
      { text: 'C', startSecond: 1.0, endSecond: 1.5 },
    ];
    const segmentData: SegmentWithFurigana[] = [
      { text: 'AB', text_furigana: 'AB', first_word_index: 0, last_word_index: 1, furigana_status: 'ok', furigana_warning: null },
      { text: 'C',  text_furigana: 'C',  first_word_index: 2, last_word_index: 2, furigana_status: 'ok', furigana_warning: null },
    ];

    const { insertSegments } = await import('../segments');
    await insertSegments(42, segmentData, words);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].endMs).toBe(1000); // no gap — stays at wordEndMs
  });

  it('sets segmentIndex as the array position', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertSegments } = await import('../segments');
    await insertSegments(42, SAMPLE_SEGMENTS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].segmentIndex).toBe(0);
    expect(rows[0][1].segmentIndex).toBe(1);
  });

  it('falls back to one sentence per segment when sentence metadata is missing', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertSegments } = await import('../segments');
    await insertSegments(42, SAMPLE_SEGMENTS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    const firstSentences = rows[0][0].sentences as { text: string; start_ms: number; end_ms: number }[];
    expect(firstSentences).toHaveLength(1);
    expect(firstSentences[0].text).toBe('おはようございます');
    expect(firstSentences[0].start_ms).toBe(0);
    expect(firstSentences[0].end_ms).toBe(1500); // gap-filled to segment 1 startMs
  });

  it('persists provided sentence metadata instead of synthesizing one sentence', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });
    const segmentData: SegmentInsertInput[] = [{
      text: 'おはようございます。今日も',
      text_furigana: 'おはようございます。<ruby>今日<rt>きょう</rt></ruby>も',
      first_word_index: 0,
      last_word_index: 2,
      furigana_status: 'ok',
      furigana_warning: null,
      sentences: [
        {
          text: 'おはようございます。',
          first_word_index: 0,
          last_word_index: 1,
          start_ms: 0,
          end_ms: 1200,
        },
        {
          text: '今日も',
          first_word_index: 2,
          last_word_index: 2,
          start_ms: 1500,
          end_ms: 2000,
        },
      ],
    }];

    const { insertSegments } = await import('../segments');
    await insertSegments(42, segmentData, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].sentences).toEqual([
      { text: 'おはようございます。', start_ms: 0, end_ms: 1200 },
      { text: '今日も', start_ms: 1500, end_ms: 2000 },
    ]);
  });

  it('stores episodeId on each row', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertSegments } = await import('../segments');
    await insertSegments(42, SAMPLE_SEGMENTS, SAMPLE_WORDS);

    const [rows] = valuesCapture.mock.calls;
    expect(rows[0][0].episodeId).toBe(42);
    expect(rows[0][1].episodeId).toBe(42);
  });

  it('persists furigana status and warning fields', async () => {
    const valuesCapture = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesCapture });

    const { insertSegments } = await import('../segments');
    await insertSegments(42, [
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
    const { insertSegments } = await import('../segments');
    const badSegment: SegmentWithFurigana[] = [{
      text: 'テスト',
      text_furigana: 'テスト',
      first_word_index: 99, // out of bounds
      last_word_index: 99,
      furigana_status: 'ok',
      furigana_warning: null,
    }];
    await expect(insertSegments(42, badSegment, SAMPLE_WORDS)).rejects.toThrow(
      'out-of-bounds'
    );
  });

  it('throws a clear error when last_word_index is out of bounds', async () => {
    const { insertSegments } = await import('../segments');
    const badSegment: SegmentWithFurigana[] = [{
      text: 'テスト',
      text_furigana: 'テスト',
      first_word_index: 0,
      last_word_index: 99, // out of bounds
      furigana_status: 'ok',
      furigana_warning: null,
    }];
    await expect(insertSegments(42, badSegment, SAMPLE_WORDS)).rejects.toThrow(
      'out-of-bounds'
    );
  });
});

describe('getSegmentsByEpisodeId()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it('calls db.select and filters by episodeId', async () => {
    const { getSegmentsByEpisodeId } = await import('../segments');
    await getSegmentsByEpisodeId(7);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it('orders by segmentIndex ascending', async () => {
    const { getSegmentsByEpisodeId } = await import('../segments');
    await getSegmentsByEpisodeId(7);
    expect(mockOrderBy).toHaveBeenCalled();
  });

  it('returns the result from db', async () => {
    const fakeSegments = [
      { id: 1, segmentIndex: 0, furiganaStatus: 'ok', furiganaWarning: null },
      { id: 2, segmentIndex: 1, furiganaStatus: 'suspect', furiganaWarning: 'warn' },
    ];
    mockOrderBy.mockResolvedValueOnce(fakeSegments);

    const { getSegmentsByEpisodeId } = await import('../segments');
    const result = await getSegmentsByEpisodeId(7);
    expect(result).toEqual(fakeSegments);
  });
});

describe('getSegmentById()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('returns null when the segment does not exist', async () => {
    const { getSegmentById } = await import('../segments');

    await expect(getSegmentById(99)).resolves.toBeNull();
  });

  it('returns the matching segment when it exists', async () => {
    const fakeSegment = {
      id: 8,
      episodeId: 3,
      segmentIndex: 2,
      textRaw: '日本語です',
      textFurigana: '日本語です',
      furiganaStatus: 'ok',
      furiganaWarning: null,
      startMs: 1000,
      endMs: 2000,
      sentences: [],
      createdAt: new Date(),
    };
    mockWhere.mockResolvedValueOnce([fakeSegment]);

    const { getSegmentById } = await import('../segments');

    await expect(getSegmentById(8)).resolves.toEqual(fakeSegment);
  });
});

describe('getRandomStudyingSegment()', () => {
  const FAKE_ROW = {
    segmentId: 5,
    segmentIndex: 2,
    textRaw: '日本語の文です。',
    startMs: 1000,
    endMs: 3000,
    episodeId: 10,
    episodeNumber: 3,
    episodeTitle: 'Test Episode',
    podcastSlug: 'test-podcast',
    podcastName: 'Test Podcast',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockInnerJoin
      .mockReturnValueOnce({ innerJoin: mockInnerJoin })
      .mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it('returns null when no studying segment exists', async () => {
    const { getRandomStudyingSegment } = await import('../segments');
    await expect(getRandomStudyingSegment()).resolves.toBeNull();
  });

  it('returns the row when a studying segment exists', async () => {
    mockLimit.mockResolvedValueOnce([FAKE_ROW]);
    const { getRandomStudyingSegment } = await import('../segments');
    await expect(getRandomStudyingSegment()).resolves.toEqual(FAKE_ROW);
  });

  it('calls db.select and applies studying/ready filters', async () => {
    const { getRandomStudyingSegment } = await import('../segments');
    await getRandomStudyingSegment();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('passes excludeSegmentId to the where clause when provided', async () => {
    const { getRandomStudyingSegment } = await import('../segments');
    await getRandomStudyingSegment(42);
    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('returns null when the only segment matches the exclude id', async () => {
    const { getRandomStudyingSegment } = await import('../segments');
    await expect(getRandomStudyingSegment(5)).resolves.toBeNull();
  });
});

describe('getSegmentByEpisodeIdAndIndex()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('returns null when the segment does not exist for the episode', async () => {
    const { getSegmentByEpisodeIdAndIndex } = await import('../segments');

    await expect(getSegmentByEpisodeIdAndIndex(3, 9)).resolves.toBeNull();
  });

  it('returns the matching segment when the episode and segment index exist', async () => {
    const fakeSegment = {
      id: 12,
      episodeId: 3,
      segmentIndex: 1,
      textRaw: '勉強します。',
      textFurigana: '勉強します。',
      furiganaStatus: 'ok',
      furiganaWarning: null,
      startMs: 1000,
      endMs: 2400,
      sentences: [],
      createdAt: new Date(),
    };
    mockWhere.mockResolvedValueOnce([fakeSegment]);

    const { getSegmentByEpisodeIdAndIndex } = await import('../segments');

    await expect(getSegmentByEpisodeIdAndIndex(3, 1)).resolves.toEqual(fakeSegment);
  });
});

describe('updateSegmentStudyStatus()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockUpdateChain(returnedRows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(returnedRows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });
    return { set, where, returning };
  }

  it('stamps learnedAt and returns the updated row when marking learned', async () => {
    const updated = { id: 7, studyStatus: 'learned' };
    const { set } = mockUpdateChain([updated]);

    const { updateSegmentStudyStatus } = await import('../segments');
    await expect(updateSegmentStudyStatus(7, 'learned')).resolves.toEqual(updated);
    expect(set).toHaveBeenCalledWith({ studyStatus: 'learned', learnedAt: expect.any(Date) });
  });

  it('clears learnedAt for non-learned statuses', async () => {
    const { set } = mockUpdateChain([{ id: 7, studyStatus: 'studying' }]);

    const { updateSegmentStudyStatus } = await import('../segments');
    await updateSegmentStudyStatus(7, 'studying');
    expect(set).toHaveBeenCalledWith({ studyStatus: 'studying', learnedAt: null });
  });

  it('returns null when no segment matched', async () => {
    mockUpdateChain([]);

    const { updateSegmentStudyStatus } = await import('../segments');
    await expect(updateSegmentStudyStatus(999, 'new')).resolves.toBeNull();
  });
});

describe('setEpisodeSegmentsStudyStatus()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cascades the status to every segment and returns the affected count', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const { setEpisodeSegmentsStudyStatus } = await import('../segments');
    await expect(setEpisodeSegmentsStudyStatus(10, 'studying')).resolves.toBe(3);

    expect(set).toHaveBeenCalledWith({ studyStatus: 'studying', learnedAt: null });
    expect(where).toHaveBeenCalled();
  });
});
