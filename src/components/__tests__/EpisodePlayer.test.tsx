// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import EpisodePlayer from '../player/EpisodePlayer';
import type { Segment } from '@/db/schema';
import * as studyNavigation from '../player/studyNavigation';

// ---------------------------------------------------------------------------
// Engine mock (hoisted)
// ---------------------------------------------------------------------------

const { engineMock } = vi.hoisted(() => {
  const state = { time: 0, isPlaying: false };
  const generalSubs = new Set<() => void>();
  const endSubs = new Set<() => void>();

  function notifyGeneral() { generalSubs.forEach((fn) => fn()); }

  const mock = {
    unlock: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    play: vi.fn((startSec?: number) => {
      if (startSec !== undefined) state.time = startSec;
      state.isPlaying = true;
      notifyGeneral();
    }),
    pause: vi.fn(() => { state.isPlaying = false; notifyGeneral(); }),
    seek: vi.fn((sec: number) => { state.time = Math.max(0, sec); notifyGeneral(); }),
    setPlaybackRate: vi.fn(),
    subscribe(fn: () => void) { generalSubs.add(fn); return () => generalSubs.delete(fn); },
    subscribeToEnd(fn: () => void) { endSubs.add(fn); return () => endSubs.delete(fn); },
    _setTime(t: number) { state.time = t; notifyGeneral(); },
    _setIsPlaying(v: boolean) { state.isPlaying = v; notifyGeneral(); },
    _reset() { state.time = 0; state.isPlaying = false; generalSubs.clear(); endSubs.clear(); },
    get currentTime() { return state.time; },
    get duration() { return 20; },
    get status() { return 'ready' as const; },
    get isPlaying() { return state.isPlaying; },
    get error() { return null; },
  };

  return { engineMock: mock };
});

vi.mock('@/lib/audio/audioEngine', () => ({ audioEngine: engineMock }));

// ---------------------------------------------------------------------------
// Fixtures / shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  engineMock._reset();
  // No-op rAF to avoid infinite loop from useAudioEngine's rAF loop
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(window.history, 'scrollRestoration', {
    configurable: true,
    writable: true,
    value: 'auto',
  });
});

function makeSegment(id: number, startMs: number, endMs: number, index: number): Segment {
  return {
    id,
    episodeId: 1,
    segmentIndex: index,
    textRaw: `テスト${id}`,
    textFurigana: `テスト${id}`,
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs,
    endMs,
    sentences: [] as unknown as Segment['sentences'],
    studyStatus: 'new',
    learnedAt: null,
    nextReview: null,
    createdAt: new Date(),
  };
}

const SEGMENTS = [
  makeSegment(1, 0, 5000, 0),
  makeSegment(2, 5000, 12000, 1),
  makeSegment(3, 12000, 20000, 2),
];

describe('EpisodePlayer (integration)', () => {
  it('renders a segment list', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the global player bar', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });

  it('clicking a segment seeks audio to its start', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // click segment 2 (startMs = 5000)
    expect(engineMock.seek).toHaveBeenCalledWith(4.9); // 5000ms / 1000 - 0.1s offset
  });

  it('play button calls audioEngine.play', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(engineMock.play).toHaveBeenCalled();
  });

  it('loop button toggles aria-pressed', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const loopBtn = screen.getByRole('button', { name: 'Toggle loop' });
    expect(loopBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(loopBtn);
    expect(loopBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('Space key toggles playback', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    expect(engineMock.play).toHaveBeenCalled();
  });

  it('no alert is shown while the engine is healthy', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses manual browser scroll restoration while mounted', () => {
    const { unmount } = render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );

    expect(window.history.scrollRestoration).toBe('manual');

    unmount();

    expect(window.history.scrollRestoration).toBe('auto');
  });

  it('restores the saved episode focus state', async () => {
    vi.spyOn(studyNavigation, 'loadEpisodeFocusState').mockReturnValue({
      episodeHref: '/podcasts/slow-japanese/episodes/7',
      segmentId: 3,
    });

    // Allow rAF to fire once so scrollSegmentToTop can call window.scrollTo.
    // The engine is not playing, so useAudioEngine's rAF loop is not running.
    vi.mocked(window.requestAnimationFrame).mockImplementationOnce((cb) => {
      cb(0);
      return 1;
    });

    render(
      <EpisodePlayer
        segments={SEGMENTS}
        audioUrl="/api/episodes/1/audio"
        durationMs={20000}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
  });

  it('saves the episode focus state when the active segment changes', async () => {
    vi.spyOn(studyNavigation, 'loadEpisodeFocusState').mockReturnValue(null);
    const saveSpy = vi.spyOn(studyNavigation, 'saveEpisodeFocusState');

    render(
      <EpisodePlayer
        segments={SEGMENTS}
        audioUrl="/api/episodes/1/audio"
        durationMs={20000}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />,
    );

    // Simulate audio advancing into segment 2 (startMs=5000, endMs=12000)
    await act(async () => {
      engineMock._setTime(6);
    });

    expect(saveSpy).toHaveBeenCalledWith({
      episodeHref: '/podcasts/slow-japanese/episodes/7',
      segmentId: 2,
    });
  });
});
