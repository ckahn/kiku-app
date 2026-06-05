import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEq = vi.fn(() => 'eq-clause');
const mockWhereSelect = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhereSelect }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockSetEpisodeSegmentsStudyStatus = vi.fn();
const mockGetEpisodeStudyStatusMap = vi.fn();

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}));
vi.mock('@/db/schema', () => ({
  episodes: { id: 'episodes.id' },
}));
vi.mock('@/db/segments', () => ({
  setEpisodeSegmentsStudyStatus: mockSetEpisodeSegmentsStudyStatus,
}));
vi.mock('@/db/episodes', () => ({
  getEpisodeStudyStatusMap: mockGetEpisodeStudyStatusMap,
}));
vi.mock('drizzle-orm', () => ({ eq: mockEq }));

describe('PATCH /api/episodes/[id]/study', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWhereSelect.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhereSelect });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockEq.mockReset().mockReturnValue('eq-clause');
    mockSetEpisodeSegmentsStudyStatus.mockReset().mockResolvedValue(undefined);
    mockGetEpisodeStudyStatusMap.mockReset();
  });

  async function callPatch(body: unknown, id = '5') {
    const { PATCH } = await import('../route');
    return PATCH(
      new Request(`http://localhost/api/episodes/${id}/study`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it('cascades "studying" to all segments and returns the derived status', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5 }]);
    mockGetEpisodeStudyStatusMap.mockResolvedValueOnce(new Map([[5, 'studying']]));

    const response = await callPatch({ studyStatus: 'studying' });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSetEpisodeSegmentsStudyStatus).toHaveBeenCalledWith(5, 'studying');
    expect(json.data).toEqual({ id: 5, studyStatus: 'studying' });
  });

  it('cascades "new" to all segments', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5 }]);
    mockGetEpisodeStudyStatusMap.mockResolvedValueOnce(new Map([[5, 'new']]));

    const response = await callPatch({ studyStatus: 'new' });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSetEpisodeSegmentsStudyStatus).toHaveBeenCalledWith(5, 'new');
    expect(json.data).toEqual({ id: 5, studyStatus: 'new' });
  });

  it('returns 400 when studyStatus is "learned" (only reachable per-segment)', async () => {
    const response = await callPatch({ studyStatus: 'learned' });

    expect(response.status).toBe(400);
    expect(mockSetEpisodeSegmentsStudyStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when studyStatus is missing', async () => {
    const response = await callPatch({});

    expect(response.status).toBe(400);
    expect(mockSetEpisodeSegmentsStudyStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when studyStatus is an invalid type', async () => {
    const response = await callPatch({ studyStatus: 123 });

    expect(response.status).toBe(400);
    expect(mockSetEpisodeSegmentsStudyStatus).not.toHaveBeenCalled();
  });

  it('returns 404 when the episode does not exist', async () => {
    mockWhereSelect.mockResolvedValueOnce([]);

    const response = await callPatch({ studyStatus: 'studying' });

    expect(response.status).toBe(404);
    expect(mockSetEpisodeSegmentsStudyStatus).not.toHaveBeenCalled();
  });
});
