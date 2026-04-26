import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEq = vi.fn(() => 'eq-clause');
const mockWhereSelect = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhereSelect }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockWhereDelete = vi.fn();
const mockDeleteBuilder = vi.fn(() => ({ where: mockWhereDelete }));

const mockDeletePrivateBlob = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    delete: mockDeleteBuilder,
  },
}));
vi.mock('@/db/schema', () => ({
  episodes: {
    _table: 'episodes_table',
    id: 'episodes.id',
  },
}));
vi.mock('@/lib/blob', () => ({ deletePrivateBlob: mockDeletePrivateBlob }));
vi.mock('drizzle-orm', () => ({ eq: mockEq }));

describe('GET/DELETE /api/episodes/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockWhereSelect.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhereSelect });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockWhereDelete.mockReset();
    mockDeleteBuilder.mockReset().mockReturnValue({ where: mockWhereDelete });
    mockDeletePrivateBlob.mockReset();
    mockEq.mockReset().mockReturnValue('eq-clause');
  });

  async function callDelete(id = '5') {
    const { DELETE } = await import('../route');
    return DELETE(new Request(`http://localhost/api/episodes/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
  }

  it('returns 404 when the episode does not exist', async () => {
    mockWhereSelect.mockResolvedValueOnce([]);

    const response = await callDelete();

    expect(response.status).toBe(404);
    expect(mockDeletePrivateBlob).not.toHaveBeenCalled();
    expect(mockDeleteBuilder).not.toHaveBeenCalled();
  });

  it('deletes the audio blob and then the episode row', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, audioUrl: 'https://blob.example.com/ep.mp3' }]);
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ deleted: true });
    expect(mockDeletePrivateBlob).toHaveBeenCalledWith('https://blob.example.com/ep.mp3');
    expect(mockDeleteBuilder).toHaveBeenCalledWith(expect.objectContaining({ _table: 'episodes_table' }));
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('still deletes the episode row when the blob is already missing', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, audioUrl: 'https://blob.example.com/missing.mp3' }]);
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('returns 500 when blob deletion fails and skips the database delete', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, audioUrl: 'https://blob.example.com/ep.mp3' }]);
    mockDeletePrivateBlob.mockRejectedValueOnce(new Error('blob service unavailable'));

    const response = await callDelete();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('blob service unavailable');
    expect(mockDeleteBuilder).not.toHaveBeenCalled();
  });
});
