// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RandomSegmentCard from '../RandomSegmentCard';
import type { RandomSegmentData } from '@/db/chunks';

const SEGMENT: RandomSegmentData = {
  chunkId: 5,
  chunkIndex: 2,
  textRaw: '日本語の文です。',
  startMs: 1000,
  endMs: 3000,
  episodeId: 10,
  episodeNumber: 3,
  episodeTitle: 'Test Episode',
  podcastSlug: 'test-podcast',
  podcastName: 'Test Podcast',
};

const SEGMENT_2: RandomSegmentData = {
  ...SEGMENT,
  chunkId: 9,
  chunkIndex: 4,
  textRaw: '別の文です。',
};

describe('RandomSegmentCard', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: SEGMENT_2 }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the segment text and metadata', () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    expect(screen.getByText('日本語の文です。')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Test Podcast');
    expect(link).toHaveTextContent('Test Episode');
  });

  it('renders play and shuffle buttons', () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    expect(screen.getByRole('button', { name: 'Play segment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show a different random segment' })).toBeInTheDocument();
  });

  it('shows Stop aria-label immediately after clicking play', () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('resumes stopped state after audio pause event', () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    const audio = document.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    fireEvent.pause(audio);
    expect(screen.getByRole('button', { name: 'Play segment' })).toBeInTheDocument();
  });

  it('disables the play button while shuffle is loading', async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise(resolve => { resolveFetch = resolve; })
    ));

    render(<RandomSegmentCard initialSegment={SEGMENT} />);

    expect(screen.getByRole('button', { name: 'Play segment' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show a different random segment' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play segment' })).toBeDisabled();
    });

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ data: SEGMENT_2 }) });
    });
  });

  it('updates segment content after a successful shuffle', async () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show a different random segment' }));
    await waitFor(() => {
      expect(screen.getByText('別の文です。')).toBeInTheDocument();
    });
  });

  it('shows an error message when shuffle fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show a different random segment' }));
    await waitFor(() => {
      expect(screen.getByText(/Could not load a new segment/i)).toBeInTheDocument();
    });
  });

  it('passes the current chunkId as exclude param when shuffling', async () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show a different random segment' }));
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/chunks/random?exclude=5');
    });
  });
});
