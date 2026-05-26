// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RandomSegmentCard from '../RandomSegmentCard';
import type { RandomSegmentData } from '@/db/chunks';

vi.mock('@/lib/audio/audioEngine', async () => {
  const { createMockAudioEngine } = await import('@/lib/audio/__tests__/mockAudioEngine');
  return { audioEngine: createMockAudioEngine() };
});

import { audioEngine } from '@/lib/audio/audioEngine';
import type { MockAudioEngine } from '@/lib/audio/__tests__/mockAudioEngine';
const engineMock = audioEngine as unknown as MockAudioEngine;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  vi.restoreAllMocks();
  engineMock._reset();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: SEGMENT_2 }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RandomSegmentCard', () => {
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

  it('shows buffering spinner and queues play when buffer is still loading on click', async () => {
    engineMock._setStatus('loading');

    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    });

    // play() not called yet — buffering spinner should be visible
    expect(engineMock.play).not.toHaveBeenCalled();
    // Button label stays 'Stop' (aria) while buffering — UI should not revert to Play
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('auto-plays at segment start when buffer becomes ready after a queued click', async () => {
    engineMock._setStatus('loading');

    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    });

    // Buffer finishes loading
    act(() => { engineMock._setStatus('ready'); });

    expect(engineMock.play).toHaveBeenCalledWith(SEGMENT.startMs / 1000 - 0.1); // minus CHUNK_PLAYBACK_OFFSET_SEC
  });

  it('resets isPlaying when load errors while a play is queued', async () => {
    engineMock._setStatus('loading');

    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    });

    act(() => { engineMock._setError('Audio fetch failed: 404'); });

    expect(screen.getByRole('button', { name: 'Play segment' })).toBeInTheDocument();
  });

  it('shows Stop aria-label immediately after clicking play', async () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('resumes stopped state after engine stops externally', async () => {
    render(<RandomSegmentCard initialSegment={SEGMENT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play segment' }));
    });
    act(() => { engineMock._setIsPlaying(false); });
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
