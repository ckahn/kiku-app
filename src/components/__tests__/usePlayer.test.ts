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

type AudioMock = ReturnType<typeof createAudioMock>;

function setup() {
  const audioMock = createAudioMock();
  const { result } = renderHook(() => usePlayer(CHUNKS, DURATION_MS));

  // Inject the mock into the audioRef
  act(() => {
    (result.current.audioRef as React.MutableRefObject<AudioMock>).current = audioMock;
  });

  return { result, audioMock };
}

describe('usePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts in global mode, paused, not looping', () => {
      const { result } = renderHook(() => usePlayer(CHUNKS, DURATION_MS));
      expect(result.current.state.mode).toBe('global');
      expect(result.current.state.isPlaying).toBe(false);
      expect(result.current.state.isLooping).toBe(false);
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
    });
  });

  describe('rewind / forward', () => {
    it('rewind subtracts 5 seconds in global mode, clamped to 0', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 3;
      act(() => { result.current.controls.rewind(); });
      // Clamped to 0 since 3 - 5 = -2
      expect(audioMock.currentTime).toBe(0);
    });

    it('forward adds 5 seconds in global mode, clamped to duration', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 18;
      act(() => { result.current.controls.forward(); });
      // Clamped to 20s (DURATION_MS / 1000)
      expect(audioMock.currentTime).toBe(20);
    });

    it('rewind in chunk mode is clamped to chunk start', () => {
      const { result, audioMock } = setup();
      act(() => { result.current.controls.focusChunk(2); }); // chunk 2: 5s–12s
      audioMock.currentTime = 6; // 6 - 5 = 1 → clamped to chunk start (5)
      act(() => { result.current.controls.rewind(); });
      expect(audioMock.currentTime).toBe(5);
    });

    it('forward in chunk mode is clamped to chunk end', () => {
      const { result, audioMock } = setup();
      act(() => { result.current.controls.focusChunk(2); }); // chunk 2: 5s–12s
      audioMock.currentTime = 10; // 10 + 5 = 15 → clamped to 12
      act(() => { result.current.controls.forward(); });
      expect(audioMock.currentTime).toBe(12);
    });
  });

  describe('focusChunk / unfocusChunk', () => {
    it('focusChunk sets mode to chunk and records chunk id', () => {
      const { result } = setup();
      act(() => { result.current.controls.focusChunk(2); });
      expect(result.current.state.mode).toBe('chunk');
      expect(result.current.state.focusedChunkId).toBe(2);
    });

    it('focusChunk seeks audio to chunk start', () => {
      const { result, audioMock } = setup();
      act(() => { result.current.controls.focusChunk(2); }); // startMs = 5000 → 5s
      expect(audioMock.currentTime).toBe(5);
    });

    it('unfocusChunk returns to global mode', () => {
      const { result } = setup();
      act(() => { result.current.controls.focusChunk(2); });
      act(() => { result.current.controls.unfocusChunk(); });
      expect(result.current.state.mode).toBe('global');
      expect(result.current.state.focusedChunkId).toBeNull();
    });
  });

  describe('toggleFurigana', () => {
    it('toggles furigana on for a chunk', () => {
      const { result } = setup();
      act(() => { result.current.controls.toggleFurigana(1); });
      expect(result.current.state.showFurigana[1]).toBe(true);
    });

    it('toggles furigana off again', () => {
      const { result } = setup();
      act(() => { result.current.controls.toggleFurigana(1); });
      act(() => { result.current.controls.toggleFurigana(1); });
      expect(result.current.state.showFurigana[1]).toBe(false);
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

  describe('restart', () => {
    it('seeks to 0 in global mode and stops', () => {
      const { result, audioMock } = setup();
      audioMock.currentTime = 15;
      act(() => { result.current.controls.restart(); });
      expect(audioMock.currentTime).toBe(0);
      expect(audioMock.pause).toHaveBeenCalled();
      expect(result.current.state.isPlaying).toBe(false);
    });

    it('seeks to chunk start in chunk mode', () => {
      const { result, audioMock } = setup();
      act(() => { result.current.controls.focusChunk(2); }); // startMs=5000
      audioMock.currentTime = 10;
      act(() => { result.current.controls.restart(); });
      expect(audioMock.currentTime).toBe(5); // chunk 2 start
    });
  });
});
