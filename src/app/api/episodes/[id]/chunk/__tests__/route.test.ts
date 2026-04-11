import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Drizzle db chain: db.select({...}).from(table).where(condition)
const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
vi.mock('@/db', () => ({ db: { select: mockSelect } }));
vi.mock('@/db/schema', () => ({ episodes: 'episodes_table' }));

const mockGetRawTranscript = vi.fn();
const mockSetEpisodeReady = vi.fn();
const mockSetEpisodeError = vi.fn();
vi.mock('@/db/episodes', () => ({
  getRawTranscript: mockGetRawTranscript,
  setEpisodeReady: mockSetEpisodeReady,
  setEpisodeError: mockSetEpisodeError,
}));

const mockInsertChunks = vi.fn();
vi.mock('@/db/chunks', () => ({ insertChunks: mockInsertChunks }));

const mockChunkTranscript = vi.fn();
const mockAddFurigana = vi.fn();
vi.mock('@/lib/api/claude', () => ({
  chunkTranscript: mockChunkTranscript,
  addFurigana: mockAddFurigana,
}));

const mockSegmentTranscriptDeterministically = vi.fn();
vi.mock('@/lib/transcript-segmentation', () => ({
  segmentTranscriptDeterministically: mockSegmentTranscriptDeterministically,
}));

const DUMMY_TRANSCRIPT = {
  language_code: 'ja',
  language_probability: 0.99,
  text: 'テスト',
  segments: [{ text: 'テスト', startSecond: 0, endSecond: 0.5 }],
};
const DUMMY_CHUNKS = [{ text: 'テスト', first_word_index: 0, last_word_index: 0 }];
const DUMMY_FURIGANA = [{
  text: 'テスト',
  text_furigana: '<ruby>テスト<rt>てすと</rt></ruby>',
  first_word_index: 0,
  last_word_index: 0,
  furigana_status: 'ok',
  furigana_warning: null,
}];

describe('POST /api/episodes/[id]/chunk', () => {
  beforeEach(() => {
    mockWhere.mockReset();
    mockGetRawTranscript.mockReset();
    mockSetEpisodeReady.mockReset();
    mockSetEpisodeError.mockReset();
    mockInsertChunks.mockReset();
    mockChunkTranscript.mockReset();
    mockAddFurigana.mockReset();
    mockSegmentTranscriptDeterministically.mockReset();
  });

  async function callRoute(id = '5') {
    const { POST } = await import('../route');
    const request = new Request(`http://localhost/api/episodes/${id}/chunk`, { method: 'POST' });
    return POST(request, { params: Promise.resolve({ id }) });
  }

  it('returns 404 when episode is not found', async () => {
    mockWhere.mockResolvedValueOnce([]);

    const res = await callRoute();
    expect(res.status).toBe(404);
  });

  it('returns 409 when episode is not in chunking status', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'ready' }]);

    const res = await callRoute();
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/ready/);
  });

  it('returns 409 for any non-chunking status', async () => {
    for (const status of ['uploaded', 'transcribing', 'error']) {
      mockWhere.mockResolvedValueOnce([{ status }]);
      const res = await callRoute();
      expect(res.status).toBe(409);
    }
  });

  it('runs full pipeline and returns 200 with ready status on success', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockReturnValueOnce(DUMMY_CHUNKS);
    mockAddFurigana.mockResolvedValueOnce(DUMMY_FURIGANA);
    mockInsertChunks.mockResolvedValueOnce(undefined);
    mockSetEpisodeReady.mockResolvedValueOnce(undefined);

    const res = await callRoute();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ status: 'ready' });
  });

  it('passes transcript segments to deterministic segmentation', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockReturnValueOnce(DUMMY_CHUNKS);
    mockAddFurigana.mockResolvedValueOnce(DUMMY_FURIGANA);
    mockInsertChunks.mockResolvedValueOnce(undefined);
    mockSetEpisodeReady.mockResolvedValueOnce(undefined);

    await callRoute('7');

    expect(mockSegmentTranscriptDeterministically).toHaveBeenCalledWith(
      DUMMY_TRANSCRIPT.segments,
      30
    );
    expect(mockChunkTranscript).not.toHaveBeenCalled();
    expect(mockGetRawTranscript).toHaveBeenCalledWith(7);
  });

  it('passes chunk output to addFurigana', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockReturnValueOnce(DUMMY_CHUNKS);
    mockAddFurigana.mockResolvedValueOnce(DUMMY_FURIGANA);
    mockInsertChunks.mockResolvedValueOnce(undefined);
    mockSetEpisodeReady.mockResolvedValueOnce(undefined);

    await callRoute();

    expect(mockAddFurigana).toHaveBeenCalledWith(DUMMY_CHUNKS);
  });

  it('calls setEpisodeError and returns 500 when deterministic segmentation throws', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockImplementationOnce(() => {
      throw new Error('Segmentation failed');
    });
    mockSetEpisodeError.mockResolvedValueOnce(undefined);

    const res = await callRoute('5');
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/Segmentation failed/);
    expect(mockSetEpisodeError).toHaveBeenCalledWith(5, 'Segmentation failed');
    expect(mockSetEpisodeReady).not.toHaveBeenCalled();
  });

  it('calls setEpisodeError and returns 500 when addFurigana throws', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockReturnValueOnce(DUMMY_CHUNKS);
    mockAddFurigana.mockRejectedValueOnce(new Error('furigana failed'));
    mockSetEpisodeError.mockResolvedValueOnce(undefined);

    const res = await callRoute('5');

    expect(res.status).toBe(500);
    expect(mockSetEpisodeError).toHaveBeenCalledWith(5, 'furigana failed');
  });

  it('calls setEpisodeError and returns 500 when insertChunks throws', async () => {
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockReturnValueOnce(DUMMY_CHUNKS);
    mockAddFurigana.mockResolvedValueOnce(DUMMY_FURIGANA);
    mockInsertChunks.mockRejectedValueOnce(new Error('db write failed'));
    mockSetEpisodeError.mockResolvedValueOnce(undefined);

    const res = await callRoute('5');

    expect(res.status).toBe(500);
    expect(mockSetEpisodeError).toHaveBeenCalledWith(5, 'db write failed');
  });

  it('logs timing for segmentation and furigana steps', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockWhere.mockResolvedValueOnce([{ status: 'chunking' }]);
    mockGetRawTranscript.mockResolvedValueOnce(DUMMY_TRANSCRIPT);
    mockSegmentTranscriptDeterministically.mockReturnValueOnce(DUMMY_CHUNKS);
    mockAddFurigana.mockResolvedValueOnce(DUMMY_FURIGANA);
    mockInsertChunks.mockResolvedValueOnce(undefined);
    mockSetEpisodeReady.mockResolvedValueOnce(undefined);

    await callRoute();

    const logMessages = logSpy.mock.calls.map(([msg]) => msg as string);
    expect(logMessages.some((m) => m.includes('deterministic segmentation') && m.includes('ms'))).toBe(true);
    expect(logMessages.some((m) => m.includes('claude furigana') && m.includes('ms'))).toBe(true);

    logSpy.mockRestore();
  });
});
