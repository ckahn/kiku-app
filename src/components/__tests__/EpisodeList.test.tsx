// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EpisodeList from '../EpisodeList';

vi.mock('../EpisodeDeleteButton', () => ({
  default: ({ episodeTitle }: { episodeTitle: string }) => <button>{`Delete ${episodeTitle}`}</button>,
}));

describe('EpisodeList', () => {
  it('renders a delete control for each episode row', () => {
    render(
      <EpisodeList
        podcastSlug="slow-japanese"
        episodes={[
          {
            id: 1,
            podcastId: 2,
            title: 'Episode One',
            episodeNumber: 1,
            audioUrl: 'https://blob.example.com/one.mp3',
            durationMs: null,
            status: 'ready',
            studyStatus: 'new',
            learnedAt: null,
            nextReview: null,
            errorMessage: null,
            createdAt: null,
            updatedAt: null,
          },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Delete Episode One' })).toBeInTheDocument();
  });
});
