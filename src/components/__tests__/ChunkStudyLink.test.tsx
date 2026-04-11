// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChunkStudyLink from '../player/ChunkStudyLink';

const KEY = 'kiku:study-transcript-restore';

beforeEach(() => {
  sessionStorage.clear();
});

describe('ChunkStudyLink', () => {
  it('builds an episode-scoped chunk-index study href', () => {
    render(
      <ChunkStudyLink
        chunkId={9}
        podcastSlug="slow-japanese"
        episodeNumber={7}
        chunkIndex={3}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    expect(
      screen.getByRole('link', { name: 'Study' })
    ).toHaveAttribute(
      'href',
      '/podcasts/slow-japanese/episodes/7/chunks/3/study'
    );
  });

  it('saves restore state to sessionStorage when clicked with an episodeHref', () => {
    render(
      <ChunkStudyLink
        chunkId={9}
        podcastSlug="slow-japanese"
        episodeNumber={7}
        chunkIndex={3}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    fireEvent.click(screen.getByRole('link', { name: 'Study' }));

    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      episodeHref: '/podcasts/slow-japanese/episodes/7',
      chunkId: 9,
    });
  });

  it('does not write to sessionStorage when episodeHref is omitted', () => {
    render(
      <ChunkStudyLink
        chunkId={9}
        podcastSlug="slow-japanese"
        episodeNumber={7}
        chunkIndex={3}
      />
    );

    fireEvent.click(screen.getByRole('link', { name: 'Study' }));

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
