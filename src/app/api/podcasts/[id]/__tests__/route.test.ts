import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAnd = vi.fn(() => 'and-clause');
const mockEq = vi.fn(() => 'eq-clause');
const mockNe = vi.fn(() => 'ne-clause');
const mockDesc = vi.fn(() => 'desc-clause');
const mockLimit = vi.fn();
const mockPodcastWhere = vi.fn();
const mockEpisodeOrderBy = vi.fn();
const podcastsTable = {
  _table: 'podcasts_table',
  id: 'podcasts.id',
  name: 'podcasts.name',
  slug: 'podcasts.slug',
  description: 'podcasts.description',
};
const episodesTable = {
  _table: 'episodes_table',
  audioUrl: 'episodes.audio_url',
  podcastId: 'episodes.podcast_id',
  createdAt: 'episodes.created_at',
};
type EpisodeWhereResult =
  | { readonly orderBy: typeof mockEpisodeOrderBy; readonly limit?: never }
  | { readonly limit: typeof mockLimit; readonly orderBy?: never };

const mockEpisodeWhere = vi.fn<() => EpisodeWhereResult>(() => ({ orderBy: mockEpisodeOrderBy }));
const mockFrom = vi.fn((table: { _table: string }) => {
  if (table._table === 'podcasts_table') {
    return { where: mockPodcastWhere };
  }

  return { where: mockEpisodeWhere };
});
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
  podcasts: podcastsTable,
  episodes: episodesTable,
}));
vi.mock('@/lib/blob', () => ({ deletePrivateBlob: mockDeletePrivateBlob }));
vi.mock('drizzle-orm', () => ({ and: mockAnd, desc: mockDesc, eq: mockEq, ne: mockNe }));

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
    mockWhereUpdate.mockReset();
    mockSetUpdate.mockReset().mockReturnValue({ where: mockWhereUpdate });
    mockUpdateBuilder.mockReset().mockReturnValue({ set: mockSetUpdate });
    mockDeletePrivateBlob.mockReset();
    mockAnd.mockReset().mockReturnValue('and-clause');
    mockEq.mockReset().mockReturnValue('eq-clause');
    mockNe.mockReset().mockReturnValue('ne-clause');
    mockDesc.mockReset().mockReturnValue('desc-clause');
    mockLimit.mockReset();
  });

  function mockEpisodeRowsAndReferences(
    episodeRows: Array<{ id: number; audioUrl: string }>,
    referenceRows: Array<Array<{ id: number }>>
  ): void {
    mockEpisodeWhere.mockReturnValueOnce({ orderBy: mockEpisodeOrderBy });
    mockEpisodeOrderBy.mockResolvedValueOnce(episodeRows);
    for (const rows of referenceRows) {
      mockEpisodeWhere.mockReturnValueOnce({ limit: mockLimit });
      mockLimit.mockResolvedValueOnce(rows);
    }
  }

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
    mockEpisodeRowsAndReferences(
      [
        { id: 11, audioUrl: 'https://blob.example.com/one.mp3' },
        { id: 12, audioUrl: 'https://blob.example.com/two.mp3' },
      ],
      [[], []]
    );
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
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

  it('skips a blob when an episode outside the podcast still references it', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeRowsAndReferences(
      [
        { id: 11, audioUrl: 'https://blob.example.com/shared.mp3' },
        { id: 12, audioUrl: 'https://blob.example.com/unique.mp3' },
      ],
      [[{ id: 99 }], []]
    );
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockDeletePrivateBlob).toHaveBeenCalledOnce();
    expect(mockDeletePrivateBlob).toHaveBeenCalledWith('https://blob.example.com/unique.mp3');
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('only deletes a shared podcast-local blob once', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeRowsAndReferences(
      [
        { id: 11, audioUrl: 'https://blob.example.com/shared.mp3' },
        { id: 12, audioUrl: 'https://blob.example.com/shared.mp3' },
      ],
      [[]]
    );
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockDeletePrivateBlob).toHaveBeenCalledOnce();
    expect(mockDeletePrivateBlob).toHaveBeenCalledWith('https://blob.example.com/shared.mp3');
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('tolerates missing blobs while continuing podcast deletion', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeRowsAndReferences(
      [
        { id: 11, audioUrl: 'https://blob.example.com/missing.mp3' },
      ],
      [[]]
    );
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockWhereDelete.mockResolvedValueOnce(undefined);

    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockWhereDelete).toHaveBeenCalledOnce();
  });

  it('aborts podcast deletion when any blob delete fails', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'My Show' }]);
    mockEpisodeRowsAndReferences(
      [
        { id: 11, audioUrl: 'https://blob.example.com/one.mp3' },
        { id: 12, audioUrl: 'https://blob.example.com/two.mp3' },
      ],
      [[], []]
    );
    mockDeletePrivateBlob.mockResolvedValueOnce(undefined);
    mockDeletePrivateBlob.mockRejectedValueOnce(new Error('blob service unavailable'));

    const response = await callDelete();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('blob service unavailable');
    expect(mockWhereDelete).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/podcasts/[id]', () => {
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
    mockWhereUpdate.mockReset();
    mockSetUpdate.mockReset().mockReturnValue({ where: mockWhereUpdate });
    mockUpdateBuilder.mockReset().mockReturnValue({ set: mockSetUpdate });
    mockAnd.mockReset().mockReturnValue('and-clause');
    mockEq.mockReset().mockReturnValue('eq-clause');
    mockNe.mockReset().mockReturnValue('ne-clause');
  });

  async function callPatch(body: unknown, id = '7') {
    const { PATCH } = await import('../route');
    return PATCH(
      new Request(`http://localhost/api/podcasts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it('updates podcast metadata and returns the updated podcast', async () => {
    const updatedPodcast = {
      id: 7,
      name: 'News in Slow Japanese',
      slug: 'news-in-slow-japanese',
      description: 'Daily listening',
    };
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'Old Name', slug: 'old-name' }]);
    mockPodcastWhere.mockResolvedValueOnce([]);
    mockWhereUpdate.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([updatedPodcast]),
    });

    const response = await callPatch({
      name: ' News in Slow Japanese ',
      description: ' Daily listening ',
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSetUpdate).toHaveBeenCalledWith({
      name: 'News in Slow Japanese',
      slug: 'news-in-slow-japanese',
      description: 'Daily listening',
    });
    expect(json.data).toEqual(updatedPodcast);
  });

  it('clears a blank description', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'Old Name', slug: 'old-name' }]);
    mockPodcastWhere.mockResolvedValueOnce([]);
    mockWhereUpdate.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([{ id: 7, name: 'Old Name', description: null }]),
    });

    const response = await callPatch({ name: 'Old Name', description: '   ' });

    expect(response.status).toBe(200);
    expect(mockSetUpdate).toHaveBeenCalledWith({
      name: 'Old Name',
      slug: 'old-name',
      description: null,
    });
  });

  it('returns 400 when the name is empty', async () => {
    const response = await callPatch({ name: '   ', description: 'desc' });

    expect(response.status).toBe(400);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 404 when the podcast does not exist', async () => {
    mockPodcastWhere.mockResolvedValueOnce([]);

    const response = await callPatch({ name: 'New Name' });

    expect(response.status).toBe(404);
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });

  it('returns 409 when the edited name conflicts with another podcast slug', async () => {
    mockPodcastWhere.mockResolvedValueOnce([{ id: 7, name: 'Old Name', slug: 'old-name' }]);
    mockPodcastWhere.mockResolvedValueOnce([{ id: 9, name: 'News in Slow Japanese' }]);

    const response = await callPatch({ name: 'News in Slow Japanese' });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('News in Slow Japanese');
    expect(mockUpdateBuilder).not.toHaveBeenCalled();
  });
});
