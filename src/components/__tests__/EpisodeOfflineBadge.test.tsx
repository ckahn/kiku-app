// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EpisodeOfflineBadge from '../EpisodeOfflineBadge';

const mockUseDownloadRecord = vi.fn();

vi.mock('@/hooks/useDownloadRecord', () => ({
  useDownloadRecord: (episodeId: number) => mockUseDownloadRecord(episodeId),
}));

describe('EpisodeOfflineBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there is no download record', () => {
    mockUseDownloadRecord.mockReturnValue(undefined);

    const { container } = render(<EpisodeOfflineBadge episodeId={5} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an errored download', () => {
    mockUseDownloadRecord.mockReturnValue({ episodeId: 5, status: 'error' });

    const { container } = render(<EpisodeOfflineBadge episodeId={5} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an Offline chip for a complete download', () => {
    mockUseDownloadRecord.mockReturnValue({ episodeId: 5, status: 'complete' });

    render(<EpisodeOfflineBadge episodeId={5} />);

    const chip = screen.getByLabelText('Available offline');
    expect(chip).toHaveTextContent(/offline/i);
  });

  it('renders nothing for a stale downloading record', async () => {
    // Tab closed mid-download: without staleness handling this chip would
    // show frozen progress forever. The action menu owns the retry.
    const { STALE_DOWNLOAD_MS } = await import('@/lib/offline/constants');
    mockUseDownloadRecord.mockReturnValue({
      episodeId: 5,
      status: 'downloading',
      step: 'guides',
      guidesCompleted: 3,
      guidesTotal: 9,
      audioBytes: 0,
      audioTotalBytes: null,
      updatedAt: Date.now() - STALE_DOWNLOAD_MS - 1,
    });

    const { container } = render(<EpisodeOfflineBadge episodeId={5} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows guide progress while downloading guides', () => {
    mockUseDownloadRecord.mockReturnValue({
      episodeId: 5,
      status: 'downloading',
      step: 'guides',
      guidesCompleted: 3,
      guidesTotal: 9,
      audioBytes: 0,
      audioTotalBytes: null,
      updatedAt: Date.now(),
    });

    render(<EpisodeOfflineBadge episodeId={5} />);

    expect(screen.getByText(/guides 3\/9/i)).toBeInTheDocument();
  });

  it('shows audio percentage while downloading audio', () => {
    mockUseDownloadRecord.mockReturnValue({
      episodeId: 5,
      status: 'downloading',
      step: 'audio',
      guidesCompleted: 9,
      guidesTotal: 9,
      audioBytes: 500,
      audioTotalBytes: 2000,
      updatedAt: Date.now(),
    });

    render(<EpisodeOfflineBadge episodeId={5} />);

    expect(screen.getByText(/audio 25%/i)).toBeInTheDocument();
  });

  it('shows an indeterminate audio label without a known total', () => {
    mockUseDownloadRecord.mockReturnValue({
      episodeId: 5,
      status: 'downloading',
      step: 'audio',
      guidesCompleted: 9,
      guidesTotal: 9,
      audioBytes: 500,
      audioTotalBytes: null,
      updatedAt: Date.now(),
    });

    render(<EpisodeOfflineBadge episodeId={5} />);

    expect(screen.getByText(/audio…/i)).toBeInTheDocument();
  });

  it('passes the episode id to useDownloadRecord', () => {
    mockUseDownloadRecord.mockReturnValue(undefined);

    render(<EpisodeOfflineBadge episodeId={42} />);

    expect(mockUseDownloadRecord).toHaveBeenCalledWith(42);
  });
});
