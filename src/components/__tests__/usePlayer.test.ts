// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayer } from '../player/usePlayer';
import type { Chunk } from '@/db/schema';

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

// Build a minimal HTMLMediaElement mock
function createAudioMock() {
  let currentTime = 0;
  const listeners: Record<string, Array<() => void>> = {};

  const audio = {
    error: null as { code: number } | null,
    get currentTime() { return currentTime; },
    set currentTime(v: number) { currentTime = v; },
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb);
    }),
    _emit(event: string) {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
  };

  return audio;
}

function setup() {
  const audioMock = createAudioMock();
  const { result } = renderHook(() => usePlayer(CHUNKS, DURATION_MS));

  // Inject the mock via the callback ref so audioMounted state updates too
  act(() => {
    result.current.setAudioEl(audioMock as unknown as HTMLAudioElement);
  });

  return { result, audioMock };
}

describe('usePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts paused, not looping, at time 0', () => {
      const { result } = renderHook(() => usePlayer(CHUNKS, DURATION_MS));
      expect(result.current.state.isPlaying).toBe(false);
      expect(result.current.state.isLooping).toBe(false);
      expect(result.current.state.currentTime).toBe(0);
    });
  });

  describe('play / pause / toggle', () => {
    it('play() calls audio.play() and sets isPlaying', async () => {
      const { result, audioMock } = setup();
      await act(async () => {
        result.current.controls.play();
      });
      expect(audioMock.play).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(true);
    });

    it('pause() calls audio.pause() and clears isPlaying', async () => {
      const { result, audioMock } = setup();
      await act(async () => {
        result.current.controls.play();
      });
      act(() => {
        result.current.controls.pause();
      });
      expect(audioMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });

    it('toggle() while paused calls play', async () => {
      const { result, audioMock } = setup();
      await act(async () => {
        result.current.controls.toggle();
      });
      expect(audioMock.play).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(true);
    });

    it('toggle() while playing calls pause', async () => {
      const { result, audioMock } = setup();
      await act(async () => {
        result.current.controls.play();
      });
      act(() => {
        result.current.controls.toggle();
      });
      expect(audioMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });

    it('play() rejected by browser sets isPlaying to false', async () => {
      const { result, audioMock } = setup();
      audioMock.play.mockRejectedValue(new Error('autoplay blocked'));
      await act(async () => {
        result.current.controls.play();
      });
      expect(result.current.state.isPlaying).toBe(false);
      expect(result.current.playbackError).toMatch(/could not play this episode audio/i);
    });

    it('successful play clears a previous playback error', async () => {
      const { result, audioMock } = setup();
      audioMock.play.mockRejectedValueOnce(new Error('forbidden'));
      await act(async () => {
        result.current.controls.play();
      });
      expect(result.current.playbackError).not.toBeNull();

      audioMock.play.mockResolvedValueOnce(undefined);
      await act(async () => {
        result.current.controls.play();
      });
      expect(result.current.state.isPlaying).toBe(true);
      expect(result.current.playbackError).toBeNull();
    });
  });

  describe('audio element errors', () => {
    it('sets a playback error when the audio element emits an error event', () => {
      const { result, audioMock } = setup();
      audioMock.error = { code: 2 };

      act(() => {
        audioMock._emit('error');
      });

      expect(result.current.state.isPlaying).toBe(false);
      expect(result.current.playbackError).toMatch(/could not play this episode audio/i);
    });
  });

  describe('rewind / forward', () => {
    it('rewind subtracts 5 seconds, clamped to 0', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 3;
      act(() => { result.current.controls.rewind(); });
      expect(audioMock.currentTime).toBe(0);
    });

    it('forward adds 5 seconds, clamped to duration', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 18;
      act(() => { result.current.controls.forward(); });
      expect(audioMock.currentTime).toBe(20);
    });
  });

  describe('seekToChunk', () => {
    it('seekToChunk seeks audio to chunk start', () => {
      const { result, audioMock } = setup();
      act(() => { result.current.controls.seekToChunk(2); });
      expect(audioMock.currentTime).toBe(5); // 5000ms / 1000
    });

    it('seekToChunk to first chunk seeks to 0', () => {
      const { result, audioMock } = setup();
      act(() => { result.current.controls.seekToChunk(1); });
      expect(audioMock.currentTime).toBe(0);
    });

    it('seekToChunk with unknown chunk id does nothing', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 5;
      act(() => { result.current.controls.seekToChunk(999); });
      expect(audioMock.currentTime).toBe(5);
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
    it('seeks back to chunk start when timeupdate fires past the chunk end while looping', () => {
      const { result, audioMock } = setup();

      // Enable looping and position inside chunk 2 (5s–12s)
      act(() => { result.current.controls.toggleLoop(); });
      audioMock.currentTime = 6;
      act(() => { audioMock._emit('timeupdate'); });

      // Simulate time advancing past chunk 2's end
      audioMock.currentTime = 12.1;
      act(() => { audioMock._emit('timeupdate'); });

      // Should have been reset to chunk 2's start
      expect(audioMock.currentTime).toBe(5); // 5000ms / 1000
    });

    it('does not seek back when looping is off', () => {
      const { audioMock } = setup();

      // Position inside chunk 2, then advance past it — no loop active
      audioMock.currentTime = 6;
      act(() => { audioMock._emit('timeupdate'); });
      audioMock.currentTime = 12.1;
      act(() => { audioMock._emit('timeupdate'); });

      expect(audioMock.currentTime).toBe(12.1);
    });

    it('loops the new chunk after seekToChunk while looping', () => {
      const { result, audioMock } = setup();

      // Enable looping, establish loop chunk 1 (0–5s)
      act(() => { result.current.controls.toggleLoop(); });
      audioMock.currentTime = 2;
      act(() => { audioMock._emit('timeupdate'); });

      // Seek to chunk 3 (12s–20s)
      act(() => { result.current.controls.seekToChunk(3); });
      audioMock.currentTime = 14;
      act(() => { audioMock._emit('timeupdate'); });

      // Advance past chunk 3's end
      audioMock.currentTime = 20.1;
      act(() => { audioMock._emit('timeupdate'); });

      expect(audioMock.currentTime).toBe(12); // 12000ms / 1000
    });

    it('loops chunk on ended event when looping is active', async () => {
      const { result, audioMock } = setup();

      act(() => { result.current.controls.toggleLoop(); });
      audioMock.currentTime = 14;
      act(() => { audioMock._emit('timeupdate'); });

      // Episode ends while in chunk 3 (12s–20s)
      await act(async () => { audioMock._emit('ended'); });

      expect(audioMock.currentTime).toBe(12);
      expect(audioMock.play).toHaveBeenCalled();
    });

    it('pauses on ended event when looping is off', async () => {
      const { result, audioMock } = setup();
      await act(async () => { result.current.controls.play(); });
      await act(async () => { audioMock._emit('ended'); });

      expect(result.current.state.isPlaying).toBe(false);
      // play was called once for the initial play, not again for loop
      expect(audioMock.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('restart', () => {
    it('seeks to 0 and stops', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 15;
      act(() => { result.current.controls.restart(); });
      expect(audioMock.currentTime).toBe(0);
      expect(audioMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });
  });
});
