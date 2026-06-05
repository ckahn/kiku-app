import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateSegmentStudyStatus = vi.fn();

vi.mock('@/db/segments', () => ({
  updateSegmentStudyStatus: mockUpdateSegmentStudyStatus,
}));

describe('PATCH /api/segments/[id]/study', () => {
  beforeEach(() => {
    vi.resetModules();
    mockUpdateSegmentStudyStatus.mockReset();
  });

  async function callPatch(body: unknown, id = '7') {
    const { PATCH } = await import('../route');
    return PATCH(
      new Request(`http://localhost/api/segments/${id}/study`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it.each(['new', 'studying', 'learned'] as const)(
    'updates the segment to "%s" and returns it',
    async (studyStatus) => {
      const updated = { id: 7, studyStatus };
      mockUpdateSegmentStudyStatus.mockResolvedValueOnce(updated);

      const response = await callPatch({ studyStatus });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(mockUpdateSegmentStudyStatus).toHaveBeenCalledWith(7, studyStatus);
      expect(json.data).toEqual(updated);
    }
  );

  it('returns 400 for an invalid status', async () => {
    const response = await callPatch({ studyStatus: 'mastered' });
    expect(response.status).toBe(400);
    expect(mockUpdateSegmentStudyStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when status is missing', async () => {
    const response = await callPatch({});
    expect(response.status).toBe(400);
    expect(mockUpdateSegmentStudyStatus).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid id', async () => {
    const response = await callPatch({ studyStatus: 'new' }, 'abc');
    expect(response.status).toBe(400);
    expect(mockUpdateSegmentStudyStatus).not.toHaveBeenCalled();
  });

  it('returns 404 when the segment does not exist', async () => {
    mockUpdateSegmentStudyStatus.mockResolvedValueOnce(null);

    const response = await callPatch({ studyStatus: 'studying' });
    expect(response.status).toBe(404);
  });
});
