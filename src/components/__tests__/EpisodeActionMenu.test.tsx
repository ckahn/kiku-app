// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EpisodeActionMenu from '../EpisodeActionMenu';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockMutateWithOutbox = vi.fn();
vi.mock('@/lib/offline/mutateWithOutbox', () => ({
  mutateWithOutbox: (...args: unknown[]) => mockMutateWithOutbox(...args),
}));

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('EpisodeActionMenu', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    mockMutateWithOutbox.mockReset();
    vi.restoreAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
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

  it('toggles study status from new to studying and refreshes on a synced result', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'synced' });

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));

    await waitFor(() =>
      expect(mockMutateWithOutbox).toHaveBeenCalledWith({
        kind: 'episode-status',
        targetId: 5,
        status: 'studying',
        isOnline: true,
      })
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('toggles study status from studying to new and refreshes on a synced result', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'synced' });

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="studying"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /stop studying/i }));

    await waitFor(() =>
      expect(mockMutateWithOutbox).toHaveBeenCalledWith({
        kind: 'episode-status',
        targetId: 5,
        status: 'new',
        isOnline: true,
      })
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('alerts a will-sync message on a queued study toggle and does not refresh', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'queued' });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/will sync when online/i)));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('alerts on a study toggle mutation failure', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockRejectedValue(new Error('Server error'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Server error'));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('does not cascade when the study-toggle confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(mockMutateWithOutbox).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('a queued offline toggle flips the menu label optimistically', async () => {
    setOnline(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'queued' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));

    // The prop is server-derived and there was no refresh -- the component's
    // local optimistic state must carry the flip, or the label (and the next
    // toggle's direction) go stale.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    expect(screen.getByRole('menuitem', { name: /stop studying/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /start studying/i })).not.toBeInTheDocument();
  });

  it('a second offline toggle sends the reversed status, not the same direction again', async () => {
    setOnline(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'queued' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));
    await waitFor(() =>
      expect(mockMutateWithOutbox).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'studying' })
      )
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /stop studying/i }));

    await waitFor(() =>
      expect(mockMutateWithOutbox).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'new' })
      )
    );
    expect(mockMutateWithOutbox).toHaveBeenCalledTimes(2);
  });

  it('the study toggle stays enabled while offline and routes isOnline through to mutateWithOutbox', async () => {
    setOnline(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'queued' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));
    expect(screen.getByRole('menuitem', { name: /start studying/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('menuitem', { name: /start studying/i }));

    await waitFor(() =>
      expect(mockMutateWithOutbox).toHaveBeenCalledWith(
        expect.objectContaining({ isOnline: false })
      )
    );
  });

  it('shows the offline download item when podcastSlug is provided', async () => {
    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        podcastSlug="slow-japanese"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));

    expect(screen.getByRole('menuitem', { name: /make available offline/i })).toBeInTheDocument();
  });

  it('hides the offline download item without a podcastSlug', async () => {
    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));

    expect(screen.queryByRole('menuitem', { name: /make available offline/i })).not.toBeInTheDocument();
  });

  it('disables edit and delete (but not study toggle) while offline', async () => {
    setOnline(false);

    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));

    expect(screen.getByRole('menuitem', { name: /edit episode/i })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /start studying/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /delete episode/i })).toBeDisabled();
  });

  it('keeps edit, study, and delete actions enabled while online', async () => {
    render(
      <EpisodeActionMenu
        episodeId={5}
        episodeTitle="Old Episode"
        episodeNumber={3}
        studyStatus="new"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Old Episode' }));

    expect(screen.getByRole('menuitem', { name: /edit episode/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /start studying/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /delete episode/i })).toBeEnabled();
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
