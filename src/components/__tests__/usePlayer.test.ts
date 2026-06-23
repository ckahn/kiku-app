// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayer } from '../player/usePlayer';
import type { Segment } from '@/db/schema';

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

function makeSegment(id: number, startMs: number, endMs: number): Segment {
  return {
    id,
    episodeId: 1,
    segmentIndex: id - 1,
    textRaw: 'テスト',
    textFurigana: 'テスト',
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
  makeSegment(1, 0, 5000),
  makeSegment(2, 5000, 12000),
  makeSegment(3, 12000, 20000),
];

const DURATION_MS = 20000;
const AUDIO_URL = '/api/episodes/1/audio';

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setup() {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);
  const { result } = renderHook(() => usePlayer(SEGMENTS, DURATION_MS, AUDIO_URL));
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

    it('forward starts from the restored segment while audio is still loading', () => {
      act(() => { engineMock._setStatus('loading'); });
      const { result } = setup();

      act(() => { result.current.controls.seekToSegment(2); });
      act(() => { result.current.controls.forward(); });

      expect(engineMock.seek).toHaveBeenLastCalledWith(9.9);
    });
  });

  describe('seekToSegment', () => {
    it('seekToSegment seeks engine to segment start', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToSegment(2); });
      expect(engineMock.seek).toHaveBeenCalledWith(4.9); // 5000ms / 1000 - 0.1s offset
    });

    it('seekToSegment to first segment seeks to 0', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToSegment(1); });
      expect(engineMock.seek).toHaveBeenCalledWith(0);
    });

    it('seekToSegment with unknown segment id does nothing', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToSegment(999); });
      expect(engineMock.seek).not.toHaveBeenCalled();
    });

    it('seekToSegment updates state.currentTime synchronously without waiting for rAF', () => {
      const { result } = setup();
      act(() => { result.current.controls.seekToSegment(2); });
      expect(result.current.state.currentTime).toBe(4.9); // 5000ms / 1000 - 0.1s offset
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

  describe('segment looping', () => {
    it('seeks back to segment start when time passes the segment end while looping', () => {
      const { result } = setup();

      // Enable looping, start playback atomically at time inside segment 2 (5s–12s)
      act(() => { result.current.controls.toggleLoop(); });
      act(() => { engineMock.play(6); });

      // Advance past segment 2's end
      act(() => { engineMock._setTime(12.1); });

      // Should have seeked back to segment 2's start (5s - 0.1s offset = 4.9s)
      expect(engineMock.seek).toHaveBeenLastCalledWith(4.9);
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

    it('loops the new segment after seekToSegment while looping', () => {
      const { result } = setup();

      // Enable looping, establish loop at segment 1
      act(() => { result.current.controls.toggleLoop(); });
      act(() => { engineMock.play(2); }); // isPlaying = true, time = 2

      // Seek to segment 3 (12s–20s) — locks loop segment to segment 3
      vi.clearAllMocks();
      act(() => { result.current.controls.seekToSegment(3); });

      // Advance past segment 3's end
      act(() => { engineMock._setTime(20.1); });

      expect(engineMock.seek).toHaveBeenLastCalledWith(11.9); // 12000ms / 1000 - 0.1s offset
    });

    it('loops segment on natural file end when looping is active', () => {
      const { result } = setup();

      // Enable looping, start in segment 3 (12s–20s)
      act(() => { result.current.controls.toggleLoop(); });
      act(() => { engineMock.play(14); }); // isPlaying = true, time = 14

      // Simulate the audio file reaching its natural end
      act(() => { engineMock._triggerNaturalEnd(); });

      // Should have restarted from segment 3's start (12s - 0.1s offset = 11.9s)
      expect(engineMock.play).toHaveBeenCalledWith(11.9); // 12000ms / 1000 - 0.1s offset
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

    it('seeks before pausing so a playing future segment settles at 0:00', () => {
      const { result } = setup();
      act(() => { engineMock.play(14); });

      act(() => { result.current.controls.restart(); });

      expect(engineMock.seek).toHaveBeenCalledWith(0);
      expect(engineMock.pause).toHaveBeenCalled();
      expect(engineMock.seek.mock.invocationCallOrder[0]).toBeLessThan(
        engineMock.pause.mock.invocationCallOrder[0],
      );
      expect(engineMock.currentTime).toBe(0);
      expect(engineMock.isPlaying).toBe(false);
      expect(result.current.state.currentTime).toBe(0);
      expect(result.current.state.isPlaying).toBe(false);
    });
  });
});
