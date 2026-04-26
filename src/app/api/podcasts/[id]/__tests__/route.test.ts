import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEq = vi.fn(() => 'eq-clause');
const mockDesc = vi.fn(() => 'desc-clause');
const mockPodcastWhere = vi.fn();
const mockEpisodeOrderBy = vi.fn();
const podcastsTable = {
  _table: 'podcasts_table',
  id: 'podcasts.id',
};
const episodesTable = {
  _table: 'episodes_table',
  podcastId: 'episodes.podcast_id',
  createdAt: 'episodes.created_at',
};
const mockEpisodeWhere = vi.fn(() => ({ orderBy: mockEpisodeOrderBy }));
const mockFrom = vi.fn((table: { _table: string }) => {
  if (table._table === 'podcasts_table') {
    return { where: mockPodcastWhere };
  }

  return { where: mockEpisodeWhere };
});
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
  podcasts: podcastsTable,
  episodes: episodesTable,
}));
vi.mock('@/lib/blob', () => ({ deletePrivateBlob: mockDeletePrivateBlob }));
vi.mock('drizzle-orm', () => ({ desc: mockDesc, eq: mockEq }));

describe('DELETE /api/podcasts/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPodcastWhere.mockReset();
    mockEpisodeOrderBy.mockReset();
    mockEpisodeWhere.mockReset().mockReturnValue({ orderBy: mockEpisodeOrderBy });
    mockFrom.mockReset().mockImplementation((table: { _table: string }) => {
      if (table._table === 'podcasts_table') {
        return { where: mockPodcastWhere };
      }

      return { where: mockEpisodeWhere };
    });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockWhereDelete.mockReset();
    mockDeleteBuilder.mockReset().mockReturnValue({ where: mockWhereDelete });
    mockDeletePrivateBlob.mockReset();
    mockEq.mockReset().mockReturnValue('eq-clause');
    mockDesc.mockReset().mockReturnValue('desc-clause');
  });

  async function callDelete(id = '7') {
    const { DELETE } = await import('../route');
    return DELETE(new Request(`http://localhost/api/podcasts/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
  }

  it('returns 404 when the podcast does not exist', async () => {
    mockPodcastWhere.mockResolvedValueOnce([]);

    const response = await callDelete();

    expect(response.status).toBe(404);
    expect(mockDeletePrivateBlob).not.toHaveBeenCalled();
    expect(mockDeleteBuilder).not.toHaveBeenCalled();
  });

  it('deletes all episode blobs before deleting the podcast row', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeOrderBy.mockResolvedValueOnce([
      { id: 11, audioUrl: 'https://blob.example.com/one.mp3' },
      { id: 12, audioUrl: 'https://blob.example.com/two.mp3' },
    ]);
    mockDeletePrivateBlob.mockResolvedValueOnce('deleted');
    mockDeletePrivateBlob.mockResolvedValueOnce('deleted');
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ deleted: true });
    expect(mockDeletePrivateBlob).toHaveBeenNthCalledWith(1, 'https://blob.example.com/one.mp3');
    expect(mockDeletePrivateBlob).toHaveBeenNthCalledWith(2, 'https://blob.example.com/two.mp3');
    expect(mockDeleteBuilder).toHaveBeenCalledWith(expect.objectContaining({ _table: 'podcasts_table' }));
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('tolerates missing blobs while continuing podcast deletion', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeOrderBy.mockResolvedValueOnce([
      { id: 11, audioUrl: 'https://blob.example.com/missing.mp3' },
    ]);
    mockDeletePrivateBlob.mockResolvedValueOnce('not_found');
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('aborts podcast deletion when any blob delete fails', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeOrderBy.mockResolvedValueOnce([
      { id: 11, audioUrl: 'https://blob.example.com/one.mp3' },
      { id: 12, audioUrl: 'https://blob.example.com/two.mp3' },
    ]);
    mockDeletePrivateBlob.mockResolvedValueOnce('deleted');
    mockDeletePrivateBlob.mockRejectedValueOnce(new Error('blob service unavailable'));

    const response = await callDelete();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('blob service unavailable');
    expect(mockWhereDelete).not.toHaveBeenCalled();
  });
});
