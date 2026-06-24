// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LearnedEpisodesList from '../LearnedEpisodesList';

vi.mock('../EpisodeActionMenu', () => ({
  default: ({ episodeTitle }: { episodeTitle: string }) => <button>{`Actions for ${episodeTitle}`}</button>,
}));

vi.mock('../EpisodeStatusBadge', () => ({
  default: () => <span>Learned</span>,
}));

const baseEpisode = {
  id: 1,
  title: 'Episode One',
  episodeNumber: 1,
  status: 'ready' as const,
  studyStatus: 'learned' as const,
  podcastSlug: 'slow-japanese',
  podcastName: 'Slow Japanese',
};

describe('LearnedEpisodesList', () => {
  it('renders a row for each episode with title and podcast name', () => {
    render(
      <LearnedEpisodesList
        episodes={[
          baseEpisode,
          { ...baseEpisode, id: 2, title: 'Episode Two', episodeNumber: 2 },
        ]}
      />
    );

    expect(screen.getByText('Episode One')).toBeInTheDocument();
    expect(screen.getByText('Episode Two')).toBeInTheDocument();
    expect(screen.getAllByText(/Slow Japanese · Episode/)).toHaveLength(2);
  });

  it('links each row to the episode study page', () => {
    render(<LearnedEpisodesList episodes={[baseEpisode]} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/podcasts/slow-japanese/episodes/1');
  });

  it('renders an action menu for each episode', () => {
    render(<LearnedEpisodesList episodes={[baseEpisode]} />);

    expect(screen.getByRole('button', { name: 'Actions for Episode One' })).toBeInTheDocument();
  });

  it('renders nothing when the episodes list is empty', () => {
    const { container } = render(<LearnedEpisodesList episodes={[]} />);

    expect(container.querySelector('li')).toBeNull();
  });
});
