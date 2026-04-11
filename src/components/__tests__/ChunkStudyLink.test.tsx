// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChunkStudyLink from '../player/ChunkStudyLink';

describe('ChunkStudyLink', () => {
  it('builds an episode-scoped chunk-index study href', () => {
    render(
      <ChunkStudyLink
        podcastSlug="slow-japanese"
        episodeNumber={7}
        chunkIndex={3}
      />
    );

    expect(
      screen.getByRole('link', { name: 'Study' })
    ).toHaveAttribute(
      'href',
      '/podcasts/slow-japanese/episodes/7/chunks/3/study'
    );
  });
});
