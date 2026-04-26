// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PodcastList from '../PodcastList';

vi.mock('../PodcastActionMenu', () => ({
  default: ({ podcastName }: { podcastName: string }) => <button>{`Actions for ${podcastName}`}</button>,
}));

describe('PodcastList', () => {
  it('renders an action menu for each podcast row', () => {
    render(
      <PodcastList
        podcasts={[
          { id: 1, name: 'Slow Japanese', slug: 'slow-japanese', description: 'desc', imageUrl: null, createdAt: null },
          { id: 2, name: 'News', slug: 'news', description: null, imageUrl: null, createdAt: null },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Actions for Slow Japanese' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for News' })).toBeInTheDocument();
  });
});
