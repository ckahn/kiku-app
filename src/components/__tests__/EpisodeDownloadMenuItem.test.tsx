// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EpisodeDownloadMenuItem from '../EpisodeDownloadMenuItem';

const mockUseEpisodeDownload = vi.fn();

vi.mock('@/hooks/useEpisodeDownload', () => ({
  useEpisodeDownload: (input: unknown) => mockUseEpisodeDownload(input),
}));

const PROPS = {
  episodeId: 5,
  episodeTitle: 'Episode Five',
  episodeNumber: 5,
  podcastSlug: 'my-podcast',
  closeMenu: vi.fn(),
};

function makeControls(overrides: Record<string, unknown> = {}) {
  return {
    record: undefined,
    isBusy: false,
    canStart: true,
    start: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('EpisodeDownloadMenuItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PROPS.closeMenu = vi.fn();
  });

  it('shows "Make available offline" when there is no record', async () => {
    const controls = makeControls();
    mockUseEpisodeDownload.mockReturnValue(controls);

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    const item = screen.getByRole('menuitem', { name: /make available offline/i });
    await userEvent.click(item);

    expect(controls.start).toHaveBeenCalled();
    expect(PROPS.closeMenu).toHaveBeenCalled();
  });

  it('passes the episode identity to useEpisodeDownload', () => {
    mockUseEpisodeDownload.mockReturnValue(makeControls());

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    expect(mockUseEpisodeDownload).toHaveBeenCalledWith({
      episodeId: 5,
      title: 'Episode Five',
      podcastSlug: 'my-podcast',
      episodeNumber: 5,
    });
  });

  it('disables the start item while offline with an accessible hint', () => {
    mockUseEpisodeDownload.mockReturnValue(makeControls({ canStart: false }));

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    const item = screen.getByRole('menuitem', { name: /make available offline/i });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Unavailable offline');
    expect(screen.getByText('Unavailable offline')).toBeInTheDocument();
  });

  it('does not show the offline hint while the item is startable', () => {
    mockUseEpisodeDownload.mockReturnValue(makeControls());

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    expect(screen.queryByText('Unavailable offline')).toBeNull();
  });

  it('shows guide progress while downloading guides', () => {
    mockUseEpisodeDownload.mockReturnValue(
      makeControls({
        isBusy: true,
        canStart: false,
        record: {
          episodeId: 5,
          status: 'downloading',
          step: 'guides',
          guidesCompleted: 2,
          guidesTotal: 7,
          audioBytes: 0,
          audioTotalBytes: null,
        },
      })
    );

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    expect(screen.getByRole('menuitem', { name: /study guides 2\/7/i })).toBeDisabled();
  });

  it('shows audio percentage while downloading audio with a known total', () => {
    mockUseEpisodeDownload.mockReturnValue(
      makeControls({
        isBusy: true,
        canStart: false,
        record: {
          episodeId: 5,
          status: 'downloading',
          step: 'audio',
          guidesCompleted: 7,
          guidesTotal: 7,
          audioBytes: 250,
          audioTotalBytes: 1000,
        },
      })
    );

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    expect(screen.getByRole('menuitem', { name: /audio 25%/i })).toBeDisabled();
  });

  it('shows an indeterminate audio label when the total is unknown', () => {
    mockUseEpisodeDownload.mockReturnValue(
      makeControls({
        isBusy: true,
        canStart: false,
        record: {
          episodeId: 5,
          status: 'downloading',
          step: 'audio',
          guidesCompleted: 7,
          guidesTotal: 7,
          audioBytes: 250,
          audioTotalBytes: null,
        },
      })
    );

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    expect(screen.getByRole('menuitem', { name: /downloading audio/i })).toBeDisabled();
  });

  it('offers a retry when a downloading record has gone stale', async () => {
    // A stale 'downloading' record (tab closed mid-download) is surfaced by
    // the hook as not busy + startable; the menu must not show the disabled
    // progress chip, or the episode could never be downloaded again.
    const controls = makeControls({
      isBusy: false,
      canStart: true,
      record: {
        episodeId: 5,
        status: 'downloading',
        step: 'guides',
        guidesCompleted: 2,
        guidesTotal: 7,
        audioBytes: 0,
        audioTotalBytes: null,
      },
    });
    mockUseEpisodeDownload.mockReturnValue(controls);

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    const item = screen.getByRole('menuitem', { name: /retry download/i });
    expect(item).toBeEnabled();
    expect(screen.getByText(/interrupted/i)).toBeInTheDocument();

    await userEvent.click(item);
    expect(controls.start).toHaveBeenCalled();
  });

  it('shows "Retry download" with the error message when the record errored', async () => {
    const controls = makeControls({
      record: { episodeId: 5, status: 'error', step: 'guides', error: 'network gone' },
    });
    mockUseEpisodeDownload.mockReturnValue(controls);

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    const item = screen.getByRole('menuitem', { name: /retry download/i });
    expect(screen.getByText(/network gone/i)).toBeInTheDocument();

    await userEvent.click(item);
    expect(controls.start).toHaveBeenCalled();
  });

  it('shows "Remove download" when complete and removes after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const controls = makeControls({
      record: { episodeId: 5, status: 'complete' },
    });
    mockUseEpisodeDownload.mockReturnValue(controls);

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    await userEvent.click(screen.getByRole('menuitem', { name: /remove download/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(controls.remove).toHaveBeenCalled();
    expect(PROPS.closeMenu).toHaveBeenCalled();
  });

  it('does not remove when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const controls = makeControls({
      record: { episodeId: 5, status: 'complete' },
    });
    mockUseEpisodeDownload.mockReturnValue(controls);

    render(<EpisodeDownloadMenuItem {...PROPS} />);

    await userEvent.click(screen.getByRole('menuitem', { name: /remove download/i }));

    expect(controls.remove).not.toHaveBeenCalled();
    expect(PROPS.closeMenu).toHaveBeenCalled();
  });
});
