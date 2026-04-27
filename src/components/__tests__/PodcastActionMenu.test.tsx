// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PodcastActionMenu from '../PodcastActionMenu';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

describe('PodcastActionMenu', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    vi.restoreAllMocks();
  });

  it('opens an edit modal from the actions menu with current metadata', async () => {
    render(
      <PodcastActionMenu
        podcastId={7}
        podcastName="Old Name"
        podcastDescription="Old description"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Name' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit podcast/i }));

    expect(screen.getByRole('dialog', { name: 'Edit podcast' })).toBeInTheDocument();
    expect(screen.getByLabelText('Podcast name')).toHaveValue('Old Name');
    expect(screen.getByLabelText('Description')).toHaveValue('Old description');
  });

  it('saves edits with PATCH and refreshes the current view', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 7, name: 'New Name', slug: 'new-name', description: null },
      }),
    } as Response);

    render(<PodcastActionMenu podcastId={7} podcastName="Old Name" />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Name' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit podcast/i }));
    fireEvent.change(screen.getByLabelText('Podcast name'), { target: { value: 'New Name' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcasts/7',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Name', description: '' }),
        })
      )
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to the edited podcast page when requested', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 7, name: 'New Name', slug: 'new-name', description: null },
      }),
    } as Response);

    render(
      <PodcastActionMenu
        podcastId={7}
        podcastName="Old Name"
        redirectToEditedPodcast
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Name' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit podcast/i }));
    fireEvent.change(screen.getByLabelText('Podcast name'), { target: { value: 'New Name' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/podcasts/new-name'));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows API errors in the edit modal without closing it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'That podcast name is already taken' }),
    } as Response);

    render(<PodcastActionMenu podcastId={7} podcastName="Old Name" />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Name' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /edit podcast/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.getByText('That podcast name is already taken')).toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: 'Edit podcast' })).toBeInTheDocument();
  });
});
