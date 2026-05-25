// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayer } from '../player/usePlayer';
import type { Chunk } from '@/db/schema';

// ---------------------------------------------------------------------------
// Engine mock — hoisted so vi.mock factory can reference it before imports
// ---------------------------------------------------------------------------

const { engineMock, getEngineState } = vi.hoisted(() => {
  const state = {
    time: 0,
    isPlaying: false,
    error: null as string | null,
  };
  const generalSubscribers = new Set<() => void>();
  const endSubscribers = new Set<() => void>();

  function notifyGeneral() {
    generalSubscribers.forEach((fn) => fn());
  }

  const mock = {
    unlock: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    play: vi.fn((startSec?: number) => {
      if (startSec !== undefined) state.time = startSec;
      state.isPlaying = true;
      notifyGeneral();
    }),
    pause: vi.fn(() => {
      state.isPlaying = false;
      notifyGeneral();
    }),
    seek: vi.fn((sec: number) => {
      state.time = Math.max(0, sec);
      notifyGeneral();
    }),
    setPlaybackRate: vi.fn(),
    subscribe(fn: () => void) {
      generalSubscribers.add(fn);
      return () => generalSubscribers.delete(fn);
    },
    subscribeToEnd(fn: () => void) {
      endSubscribers.add(fn);
      return () => endSubscribers.delete(fn);
    },
    // Test helpers
    _setTime(t: number) { state.time = t; notifyGeneral(); },
    _setIsPlaying(v: boolean) { state.isPlaying = v; notifyGeneral(); },
    _setError(e: string | null) { state.error = e; notifyGeneral(); },
    _triggerNaturalEnd() {
      state.isPlaying = false;
      notifyGeneral();
      endSubscribers.forEach((fn) => fn());
    },
    _reset() {
      state.time = 0;
      state.isPlaying = false;
      state.error = null;
      generalSubscribers.clear();
      endSubscribers.clear();
    },
    get currentTime() { return state.time; },
    get duration() { return 20; },
    get status() { return 'ready' as const; },
    get isPlaying() { return state.isPlaying; },
    get error() { return state.error; },
  };

  return { engineMock: mock, getEngineState: () => state };
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
    textRaw: 'テスト',
    textFurigana: 'テスト',
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

const DURATION_MS = 20000;
const AUDIO_URL = '/api/episodes/1/audio';

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setup() {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);
  const { result } = renderHook(() => usePlayer(CHUNKS, DURATION_MS, AUDIO_URL));
  return { result };
}

beforeEach(() => {
  vi.clearAllMocks();
  engineMock._reset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlayer', () => {
  describe('initial state', () => {
    it('starts paused, not looping, at time 0', () => {
      const { result } = setup();
      expect(result.current.state.isPlaying).toBe(false);
      expect(result.current.state.isLooping).toBe(false);
      expect(result.current.state.currentTime).toBe(0);
    });
  });

  describe('play / pause / toggle', () => {
    it('play() calls audioEngine.play()', () => {
      const { result } = setup();
      act(() => { result.current.controls.play(); });
      expect(engineMock.play).toHaveBeenCalled();
    });

    it('play() sets isPlaying when engine confirms', () => {
      const { result } = setup();
      act(() => { result.current.controls.play(); });
      expect(result.current.state.isPlaying).toBe(true);
    });

    it('pause() calls audioEngine.pause() and clears isPlaying', () => {
      const { result } = setup();
      act(() => { result.current.controls.play(); });
      act(() => { result.current.controls.pause(); });
      expect(engineMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });

    it('toggle() while paused calls play', () => {
      const { result } = setup();
      act(() => { result.current.controls.toggle(); });
      expect(engineMock.play).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(true);
    });

    it('toggle() while playing calls pause', () => {
      const { result } = setup();
      act(() => { result.current.controls.play(); });
      act(() => { result.current.controls.toggle(); });
      expect(engineMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });
  });

  describe('engine error propagation', () => {
    it('propagates engine error to playbackError', () => {
      const { result } = setup();
      act(() => { engineMock._setError('Audio fetch failed: 404'); });
      expect(result.current.playbackError).toMatch(/404/);
    });
  });

  describe('rewind / forward', () => {
    it('rewind subtracts 5 seconds, clamped to 0', () => {
      const { result } = setup();
      act(() => { engineMock._setTime(3); });
      act(() => { result.current.controls.rewind(); });
      expect(engineMock.seek).toHaveBeenLastCalledWith(0);
    });

    it('forward adds 5 seconds, clamped to duration', () => {
      const { result } = setup();
      act(() => { engineMock._setTime(18); });
      act(() => { result.current.controls.forward(); });
      expect(engineMock.seek).toHaveBeenLastCalledWith(20);
    });
  });

  describe('seekToChunk', () => {
    it('seekToChunk seeks engine to chunk start', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToChunk(2); });
      expect(engineMock.seek).toHaveBeenCalledWith(5); // 5000ms / 1000
    });

    it('seekToChunk to first chunk seeks to 0', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToChunk(1); });
      expect(engineMock.seek).toHaveBeenCalledWith(0);
    });

    it('seekToChunk with unknown chunk id does nothing', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToChunk(999); });
      expect(engineMock.seek).not.toHaveBeenCalled();
    });

    it('seekToChunk updates state.currentTime synchronously without waiting for rAF', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToChunk(2); });
      expect(result.current.state.currentTime).toBe(5); // 5000ms / 1000
    });
  });

  describe('toggleLoop', () => {
    it('toggles loop flag', () => {
      const { result } = setup();
      act(() => { result.current.controls.toggleLoop(); });
      expect(result.current.state.isLooping).toBe(true);
      act(() => { result.current.controls.toggleLoop(); });
      expect(result.current.state.isLooping).toBe(false);
    });
  });

  describe('chunk looping', () => {
    it('seeks back to chunk start when time passes the chunk end while looping', () => {
      const { result } = setup();

      // Enable looping, start playback atomically at time inside chunk 2 (5s–12s)
      act(() => { result.current.controls.toggleLoop(); });
      act(() => {
        getEngineState().time = 6;
        getEngineState().isPlaying = true;
        // Trigger both changes in one subscriber notification via play mock
        engineMock.play(6);
      });

      // Advance past chunk 2's end
      act(() => { engineMock._setTime(12.1); });

      // Should have seeked back to chunk 2's start (5s)
      expect(engineMock.seek).toHaveBeenLastCalledWith(5);
    });

    it('does not seek back when looping is off', () => {
      setup();
      act(() => {
        engineMock.play(6); // isPlaying = true, time = 6
      });
      vi.clearAllMocks();
      act(() => { engineMock._setTime(12.1); });
      // seek() should not have been called (no loop)
      expect(engineMock.seek).not.toHaveBeenCalled();
    });

    it('loops the new chunk after seekToChunk while looping', () => {
      const { result } = setup();

      // Enable looping, establish loop at chunk 1
      act(() => { result.current.controls.toggleLoop(); });
      act(() => { engineMock.play(2); }); // isPlaying = true, time = 2

      // Seek to chunk 3 (12s–20s) — locks loop chunk to chunk 3
      vi.clearAllMocks();
      act(() => { result.current.controls.seekToChunk(3); });

      // Advance past chunk 3's end
      act(() => { engineMock._setTime(20.1); });

      expect(engineMock.seek).toHaveBeenLastCalledWith(12); // 12000ms / 1000
    });

    it('loops chunk on natural file end when looping is active', () => {
      const { result } = setup();

      // Enable looping, start in chunk 3 (12s–20s)
      act(() => { result.current.controls.toggleLoop(); });
      act(() => { engineMock.play(14); }); // isPlaying = true, time = 14

      // Simulate the audio file reaching its natural end
      act(() => { engineMock._triggerNaturalEnd(); });

      // Should have restarted from chunk 3's start
      expect(engineMock.play).toHaveBeenCalledWith(12); // 12000ms / 1000
    });

    it('pauses on natural file end when looping is off', () => {
      const { result } = setup();
      act(() => { result.current.controls.play(); });
      act(() => { engineMock._triggerNaturalEnd(); });
      expect(result.current.state.isPlaying).toBe(false);
    });
  });

  describe('restart', () => {
    it('seeks to 0 and stops', () => {
      const { result } = setup();
      act(() => { engineMock._setTime(15); });
      act(() => { result.current.controls.restart(); });
      expect(engineMock.seek).toHaveBeenCalledWith(0);
      expect(engineMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });
  });
});
