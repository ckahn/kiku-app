import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAnd = vi.fn(() => 'and-clause');
const mockEq = vi.fn(() => 'eq-clause');
const mockNe = vi.fn(() => 'ne-clause');
const mockLimit = vi.fn();
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
    audioUrl: 'episodes.audio_url',
    id: 'episodes.id',
  },
}));
vi.mock('@/lib/blob', () => ({ deletePrivateBlob: mockDeletePrivateBlob }));
vi.mock('drizzle-orm', () => ({ and: mockAnd, eq: mockEq, ne: mockNe }));

describe('GET/DELETE /api/episodes/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLimit.mockReset();
    mockWhereSelect.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhereSelect });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockWhereDelete.mockReset();
    mockDeleteBuilder.mockReset().mockReturnValue({ where: mockWhereDelete });
    mockDeletePrivateBlob.mockReset();
    mockAnd.mockReset().mockReturnValue('and-clause');
    mockEq.mockReset().mockReturnValue('eq-clause');
    mockNe.mockReset().mockReturnValue('ne-clause');
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
    mockWhereSelect.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);
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

  it('keeps the audio blob when another episode still references it', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, audioUrl: 'https://blob.example.com/shared.mp3' }]);
    mockWhereSelect.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([{ id: 8 }]);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockDeletePrivateBlob).not.toHaveBeenCalled();
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('still deletes the episode row when the blob is already missing', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, audioUrl: 'https://blob.example.com/missing.mp3' }]);
    mockWhereSelect.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('returns 500 when blob deletion fails and skips the database delete', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, audioUrl: 'https://blob.example.com/ep.mp3' }]);
    mockWhereSelect.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);
    mockDeletePrivateBlob.mockRejectedValueOnce(new Error('blob service unavailable'));

    const response = await callDelete();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('blob service unavailable');
    expect(mockDeleteBuilder).not.toHaveBeenCalled();
  });
});
