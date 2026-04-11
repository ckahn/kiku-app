// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockGetChunkByEpisodeIdAndIndex = vi.fn();
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}));

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock('@/db/schema', () => ({
  podcasts: { slug: 'slug' },
  episodes: { podcastId: 'podcastId', episodeNumber: 'episodeNumber' },
}));

vi.mock('@/db/chunks', () => ({
  getChunkByEpisodeIdAndIndex: mockGetChunkByEpisodeIdAndIndex,
}));

vi.mock('@/components/layout', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
}));

vi.mock('@/components/study/StudyScreen', () => ({
  default: ({ chunk }: { chunk: { textRaw: string } }) => (
    <div data-testid="study-screen">{chunk.textRaw}</div>
  ),
}));

describe('Study page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere
      .mockResolvedValueOnce([{ id: 1, slug: 'slow-japanese', name: 'Slow Japanese' }])
      .mockResolvedValueOnce([{ id: 2, podcastId: 1, episodeNumber: 7, title: 'Episode 7' }]);
    mockGetChunkByEpisodeIdAndIndex.mockResolvedValue({
      id: 12,
      episodeId: 2,
      chunkIndex: 3,
      textRaw: '日本語の文です。',
    });
  });

  it('renders the study screen for a valid chunk-index route', async () => {
    const { default: StudyPage } = await import('../page');

    render(
      await StudyPage({
        params: Promise.resolve({ slug: 'slow-japanese', number: '7', chunkIndex: '3' }),
      })
    );

    expect(mockGetChunkByEpisodeIdAndIndex).toHaveBeenCalledWith(2, 3);
    expect(screen.getByTestId('study-screen')).toHaveTextContent('日本語の文です。');
  });

  it('calls notFound when the chunk does not exist for the episode', async () => {
    mockGetChunkByEpisodeIdAndIndex.mockResolvedValueOnce(null);
    const { default: StudyPage } = await import('../page');

    await expect(
      StudyPage({
        params: Promise.resolve({ slug: 'slow-japanese', number: '7', chunkIndex: '99' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
