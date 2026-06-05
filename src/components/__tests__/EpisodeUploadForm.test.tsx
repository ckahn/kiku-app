// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EpisodeUploadForm from '../EpisodeUploadForm';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockUpload = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob/client', () => ({ upload: mockUpload }));

function makeFile(name = 'ep1.mp3') {
  return new File(['audio'], name, { type: 'audio/mpeg' });
}

function fillAndSubmit(container: HTMLElement, { episodeNumber = '1', title = '', file = makeFile() } = {}) {
  fireEvent.change(screen.getByPlaceholderText('Episode number'), { target: { value: episodeNumber } });
  if (title) {
    fireEvent.change(screen.getByPlaceholderText('Title (optional)'), { target: { value: title } });
  }
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.submit(container.querySelector('form')!);
}

const noop = () => {};

describe('EpisodeUploadForm', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUpload.mockReset();
    vi.restoreAllMocks();
  });

  it('renders episode number, title, and file inputs', () => {
    render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    expect(screen.getByPlaceholderText('Episode number')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Title (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('renders a Cancel button', () => {
    render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('upload button is disabled until a file is selected', () => {
    render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('upload button enables after a file is selected', () => {
    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [makeFile()] } });
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('uploads to blob then creates episode record and redirects', async () => {
    mockUpload.mockResolvedValueOnce({ url: 'https://blob.vercel-storage.com/ep1.mp3' });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { episodeNumber: 3 } }),
    } as Response);

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    fillAndSubmit(container, { episodeNumber: '3', file: makeFile('ep1.mp3') });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/podcasts/my-show/episodes/3'));

    expect(mockUpload).toHaveBeenCalledWith(
      'ep1.mp3',
      expect.any(File),
      expect.objectContaining({
        access: 'private',
        handleUploadUrl: '/api/blob/upload',
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/podcasts/1/episodes',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: 'https://blob.vercel-storage.com/ep1.mp3', episodeNumber: 3 }),
      })
    );
  });

  it('includes title in episode creation request when provided', async () => {
    mockUpload.mockResolvedValueOnce({ url: 'https://blob.vercel-storage.com/ep2.mp3' });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { episodeNumber: 2 } }),
    } as Response);

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    fillAndSubmit(container, { episodeNumber: '2', title: 'My Episode', file: makeFile('ep2.mp3') });

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/podcasts/1/episodes',
      expect.objectContaining({
        body: JSON.stringify({ blobUrl: 'https://blob.vercel-storage.com/ep2.mp3', episodeNumber: 2, title: 'My Episode' }),
      })
    );
  });

  it('calls onClose on a successful upload', async () => {
    mockUpload.mockResolvedValueOnce({ url: 'https://blob.vercel-storage.com/ep1.mp3' });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { episodeNumber: 3 } }),
    } as Response);
    const onClose = vi.fn();

    const { container } = render(
      <EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={onClose} />
    );
    fillAndSubmit(container, { episodeNumber: '3', file: makeFile('ep1.mp3') });

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked and does not submit', () => {
    const onClose = vi.fn();
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('deletes the orphan episode and does not navigate when cancelled mid-upload', async () => {
    let resolveUpload!: (value: { url: string }) => void;
    mockUpload.mockReturnValueOnce(
      new Promise<{ url: string }>((resolve) => {
        resolveUpload = resolve;
      })
    );
    // POST resolves with a created episode; the cleanup DELETE resolves too.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 42, episodeNumber: 3 } }),
    } as Response);
    const onClose = vi.fn();

    const { container, unmount } = render(
      <EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={onClose} />
    );
    fillAndSubmit(container, { episodeNumber: '3', file: makeFile('ep1.mp3') });
    await waitFor(() => expect(mockUpload).toHaveBeenCalled());

    // Close the modal (unmount) while the upload is still in flight, then let
    // the in-flight request finish — the episode gets created server-side and
    // must be cleaned up.
    unmount();
    resolveUpload({ url: 'https://blob.vercel-storage.com/ep1.mp3' });

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/episodes/42', expect.objectContaining({ method: 'DELETE' }))
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows error when blob upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Blob upload failed'));
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    fillAndSubmit(container);

    await waitFor(() => expect(screen.getByText('Blob upload failed')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows error when episode creation request fails', async () => {
    mockUpload.mockResolvedValueOnce({ url: 'https://blob.vercel-storage.com/ep1.mp3' });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'An episode with that number already exists for this podcast' }),
    } as Response);

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" onClose={noop} />);
    fillAndSubmit(container);

    await waitFor(() =>
      expect(screen.getByText('An episode with that number already exists for this podcast')).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
