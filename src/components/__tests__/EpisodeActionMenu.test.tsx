// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EpisodeActionMenu from '../EpisodeActionMenu';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

describe('EpisodeActionMenu', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    vi.restoreAllMocks();
  });

  it('opens an edit modal from the actions menu with current metadata', async () => {
    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit episode/i }));

    expect(screen.getByRole('dialog', { name: 'Edit episode' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Old Episode');
    expect(screen.getByLabelText('Episode number')).toHaveValue(3);
  });

  it('saves edits with PATCH and refreshes the current view', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 5, title: 'New Episode', episodeNumber: 4 },
      }),
    } as Response);

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit episode/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Episode' } });
    fireEvent.change(screen.getByLabelText('Episode number'), { target: { value: '4' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/episodes/5',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New Episode', episodeNumber: 4 }),
        })
      )
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to the edited episode page when requested', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 5, title: 'New Episode', episodeNumber: 4 },
      }),
    } as Response);

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        podcastSlug="slow-japanese"
        redirectToEditedEpisode
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit episode/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/podcasts/slow-japanese/episodes/4')
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows API errors in the edit modal without closing it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'An episode with that number already exists for this podcast' }),
    } as Response);

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit episode/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.getByText('An episode with that number already exists for this podcast')).toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: 'Edit episode' })).toBeInTheDocument();
  });
});
