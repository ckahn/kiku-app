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

const mockWhereUpdate = vi.fn();
const mockSetUpdate = vi.fn(() => ({ where: mockWhereUpdate }));
const mockUpdateBuilder = vi.fn(() => ({ set: mockSetUpdate }));

const mockDeletePrivateBlob = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    update: mockUpdateBuilder,
    delete: mockDeleteBuilder,
  },
}));
vi.mock('@/db/schema', () => ({
  episodes: {
    _table: 'episodes_table',
    audioUrl: 'episodes.audio_url',
    id: 'episodes.id',
    podcastId: 'episodes.podcast_id',
    episodeNumber: 'episodes.episode_number',
    title: 'episodes.title',
    updatedAt: 'episodes.updated_at',
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
    mockWhereUpdate.mockReset();
    mockSetUpdate.mockReset().mockReturnValue({ where: mockWhereUpdate });
    mockUpdateBuilder.mockReset().mockReturnValue({ set: mockSetUpdate });
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

describe('PATCH /api/episodes/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLimit.mockReset();
    mockWhereSelect.mockReset();
    mockFrom.mockReset().mockReturnValue({ where: mockWhereSelect });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockWhereUpdate.mockReset();
    mockSetUpdate.mockReset().mockReturnValue({ where: mockWhereUpdate });
    mockUpdateBuilder.mockReset().mockReturnValue({ set: mockSetUpdate });
    mockAnd.mockReset().mockReturnValue('and-clause');
    mockEq.mockReset().mockReturnValue('eq-clause');
    mockNe.mockReset().mockReturnValue('ne-clause');
  });

  async function callPatch(body: unknown, id = '5') {
    const { PATCH } = await import('../route');
    return PATCH(
      new Request(`http://localhost/api/episodes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it('updates episode metadata and returns the updated episode', async () => {
    const updatedEpisode = {
      id: 5,
      podcastId: 2,
      title: 'Edited Episode',
      episodeNumber: 4,
    };
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, podcastId: 2, episodeNumber: 3 }]);
    mockWhereSelect.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);
    mockWhereUpdate.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([updatedEpisode]),
    });

    const response = await callPatch({ title: ' Edited Episode ', episodeNumber: '4' });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSetUpdate).toHaveBeenCalledWith({
      title: 'Edited Episode',
      episodeNumber: 4,
      updatedAt: expect.any(Date),
    });
    expect(json.data).toEqual(updatedEpisode);
  });

  it('returns 400 when the title is empty', async () => {
    const response = await callPatch({ title: '   ', episodeNumber: 1 });

    expect(response.status).toBe(400);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 400 when the episode number is invalid', async () => {
    const response = await callPatch({ title: 'Episode', episodeNumber: 0 });

    expect(response.status).toBe(400);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 404 when the episode does not exist', async () => {
    mockWhereSelect.mockResolvedValueOnce([]);

    const response = await callPatch({ title: 'Episode', episodeNumber: 1 });

    expect(response.status).toBe(404);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 409 when another episode already has that number in the podcast', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ id: 5, podcastId: 2, episodeNumber: 3 }]);
    mockWhereSelect.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([{ id: 8 }]);

    const response = await callPatch({ title: 'Episode', episodeNumber: 4 });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('An episode with that number already exists for this podcast');
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });
});
