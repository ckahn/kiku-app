// @vitest-environment jsdom
/**
 * Integration tests for the audio player flow:
 * click chunk → seek to start → playback behaviour.
 * Exercises usePlayer + ChunkList + AudioPlayer working together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import EpisodePlayer from '../player/EpisodePlayer';
import type { Chunk } from '@/db/schema';

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
    _setIsPlaying(v: boolean) { state.isPlaying = v; notifyGeneral(); },
    _triggerNaturalEnd() {
      state.isPlaying = false;
      notifyGeneral();
      endSubs.forEach((fn) => fn());
    },
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
// Fixtures
// ---------------------------------------------------------------------------

function makeChunk(id: number, startMs: number, endMs: number): Chunk {
  return {
    id,
    episodeId: 1,
    chunkIndex: id - 1,
    textRaw: `テスト${id}`,
    textFurigana: `テスト${id}`,
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs,
    endMs,
    sentences: [] as unknown as Chunk['sentences'],
    createdAt: new Date(),
  };
}

const CHUNKS = [
  makeChunk(1, 0, 5000),
  makeChunk(2, 5000, 12000),
  makeChunk(3, 12000, 20000),
];

beforeEach(() => {
  vi.clearAllMocks();
  engineMock._reset();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);
});

describe('click chunk → seek to start', () => {
  it('clicking chunk 2 seeks audio to its start (5s)', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // click chunk 2
    expect(engineMock.seek).toHaveBeenCalledWith(5); // 5000ms / 1000
  });

  it('clicking chunk 1 seeks to 0', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[0]);
    expect(engineMock.seek).toHaveBeenCalledWith(0);
  });

  it('natural file end while not looping stops playback', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );

    act(() => { engineMock._triggerNaturalEnd(); });

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});

describe('EpisodePlayer global player', () => {
  it('global player bar is always present', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });
});
