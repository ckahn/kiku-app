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

describe('EpisodeUploadForm', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUpload.mockReset();
    vi.restoreAllMocks();
  });

  it('renders episode number, title, and file inputs', () => {
    render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
    expect(screen.getByPlaceholderText('Episode number')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Title (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('upload button is disabled until a file is selected', () => {
    render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('upload button enables after a file is selected', () => {
    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [makeFile()] } });
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('uploads to blob then creates episode record and redirects', async () => {
    mockUpload.mockResolvedValueOnce({ url: 'https://blob.vercel-storage.com/ep1.mp3' });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { episodeNumber: 3 } }),
    } as Response);

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
    fillAndSubmit(container, { episodeNumber: '3', file: makeFile('ep1.mp3') });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/podcasts/my-show/episodes/3'));

    expect(mockUpload).toHaveBeenCalledWith('ep1.mp3', expect.any(File), {
      access: 'private',
      handleUploadUrl: '/api/blob/upload',
    });
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

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
    fillAndSubmit(container, { episodeNumber: '2', title: 'My Episode', file: makeFile('ep2.mp3') });

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/podcasts/1/episodes',
      expect.objectContaining({
        body: JSON.stringify({ blobUrl: 'https://blob.vercel-storage.com/ep2.mp3', episodeNumber: 2, title: 'My Episode' }),
      })
    );
  });

  it('shows error when blob upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Blob upload failed'));
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
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

    const { container } = render(<EpisodeUploadForm podcastId="1" podcastSlug="my-show" />);
    fillAndSubmit(container);

    await waitFor(() =>
      expect(screen.getByText('An episode with that number already exists for this podcast')).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
