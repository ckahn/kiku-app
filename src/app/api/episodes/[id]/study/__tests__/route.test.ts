import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEq = vi.fn(() => 'eq-clause');
const mockWhereSelect = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhereSelect }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockWhereUpdate = vi.fn();
const mockSetUpdate = vi.fn(() => ({ where: mockWhereUpdate }));
const mockUpdateBuilder = vi.fn(() => ({ set: mockSetUpdate }));

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    update: mockUpdateBuilder,
  },
}));
vi.mock('@/db/schema', () => ({
  episodes: {
    id: 'episodes.id',
    studyStatus: 'episodes.study_status',
    updatedAt: 'episodes.updated_at',
  },
}));
vi.mock('drizzle-orm', () => ({ eq: mockEq }));

describe('PATCH /api/episodes/[id]/study', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWhereSelect.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhereSelect });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockWhereUpdate.mockReset();
    mockSetUpdate.mockReset().mockReturnValue({ where: mockWhereUpdate });
    mockUpdateBuilder.mockReset().mockReturnValue({ set: mockSetUpdate });
    mockEq.mockReset().mockReturnValue('eq-clause');
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

  it('transitions new → studying and returns the updated episode', async () => {
    const updatedEpisode = { id: 5, studyStatus: 'studying' };
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, studyStatus: 'new' }]);
    mockWhereUpdate.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([updatedEpisode]),
    });

    const response = await callPatch({ studyStatus: 'studying' });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSetUpdate).toHaveBeenCalledWith({
      studyStatus: 'studying',
      updatedAt: expect.any(Date),
    });
    expect(json.data).toEqual(updatedEpisode);
  });

  it('transitions studying → new and returns the updated episode', async () => {
    const updatedEpisode = { id: 5, studyStatus: 'new' };
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, studyStatus: 'studying' }]);
    mockWhereUpdate.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([updatedEpisode]),
    });

    const response = await callPatch({ studyStatus: 'new' });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(updatedEpisode);
  });

  it('returns 400 when studyStatus is "learned"', async () => {
    const response = await callPatch({ studyStatus: 'learned' });

    expect(response.status).toBe(400);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 400 when studyStatus is missing', async () => {
    const response = await callPatch({});

    expect(response.status).toBe(400);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 400 when studyStatus is an invalid type', async () => {
    const response = await callPatch({ studyStatus: 123 });

    expect(response.status).toBe(400);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 404 when the episode does not exist', async () => {
    mockWhereSelect.mockResolvedValueOnce([]);

    const response = await callPatch({ studyStatus: 'studying' });

    expect(response.status).toBe(404);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });
});
