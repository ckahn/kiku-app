// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PodcastList from '../PodcastList';

vi.mock('../PodcastDeleteButton', () => ({
  default: ({ podcastName }: { podcastName: string }) => <button>{`Delete ${podcastName}`}</button>,
}));

describe('PodcastList', () => {
  it('renders a delete control for each podcast row', () => {
    render(
      <PodcastList
        podcasts={[
          { id: 1, name: 'Slow Japanese', slug: 'slow-japanese', description: 'desc', imageUrl: null, createdAt: null },
          { id: 2, name: 'News', slug: 'news', description: null, imageUrl: null, createdAt: null },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Delete Slow Japanese' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete News' })).toBeInTheDocument();
  });
});
