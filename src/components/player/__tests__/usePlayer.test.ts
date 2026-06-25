// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayer } from '../usePlayer';
import { LOOP_WRAP_PAUSE_MS } from '@/lib/constants';
import type { Segment } from '@/db/schema';

vi.mock('@/lib/audio/audioEngine', async () => {
  const { createMockAudioEngine } = await import('@/lib/audio/__tests__/mockAudioEngine');
  return { audioEngine: createMockAudioEngine() };
});

import { audioEngine } from '@/lib/audio/audioEngine';
import type { MockAudioEngine } from '@/lib/audio/__tests__/mockAudioEngine';
const engineMock = audioEngine as unknown as MockAudioEngine;

function seg(id: number, startMs: number, endMs: number): Segment {
  return {
    id,
    episodeId: 1,
    segmentIndex: id - 1,
    textRaw: '',
    textFurigana: '',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs,
    endMs,
    sentences: [],
    studyStatus: 'new',
    learnedAt: null,
    nextReview: null,
    createdAt: new Date(),
  } as unknown as Segment;
}

const SEG1 = seg(1, 0, 5000);     // adjusted: 0–4.9s
const SEG2 = seg(2, 5000, 12000); // adjusted: 4.9–11.9s
const SEG3 = seg(3, 12000, 20000);
const SEGS = [SEG1, SEG2, SEG3];

beforeEach(() => {
  engineMock._reset();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);
});

describe('toggleLoop — anchor-at-active', () => {
  it('anchors to the active segment when loop is off', () => {
    engineMock._setTime(6); // inside SEG2 adjusted range (4.9–11.9s)
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => { result.current.controls.toggleLoop(); });

    expect(result.current.state.loopRange).toEqual({
      firstSegmentId: SEG2.id,
      lastSegmentId: SEG2.id,
    });
  });

  it('clears the loop when already looping', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({ type: 'SET_LOOP', range: { firstSegmentId: SEG1.id, lastSegmentId: SEG1.id } });
    });
    act(() => { result.current.controls.toggleLoop(); });

    expect(result.current.state.loopRange).toBeNull();
  });

  it('does not enable looping when no segment is active', () => {
    engineMock._setTime(999); // past the end of all segments
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => { result.current.controls.toggleLoop(); });

    expect(result.current.state.loopRange).toBeNull();
  });
});

describe('loop boundary wrap', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('pauses immediately then plays from first segment start after the beat', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12); // SEG2.endMs / 1000
    });

    expect(engineMock.pause).toHaveBeenCalled();
    expect(engineMock.play).not.toHaveBeenCalled();

    // After the wrap beat, play resumes from the first segment
    act(() => { vi.advanceTimersByTime(LOOP_WRAP_PAUSE_MS); });

    // segmentStartSec(SEG1) = max(0, 0 - 0.1) = 0
    expect(engineMock.play).toHaveBeenCalledWith(0);
  });

  it('does not wrap when not past the last segment end', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.pause.mockClear();

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(10); // inside SEG2, before endMs
    });

    expect(engineMock.pause).not.toHaveBeenCalled();
  });

  it('does not wrap when paused at the boundary', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.pause.mockClear();

    // isPlaying stays false; advance time to boundary
    act(() => { engineMock._setTime(12); });

    expect(engineMock.pause).not.toHaveBeenCalled();
  });

  it('re-entrancy guard: second boundary tick while beat is pending does not start another timeout', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12); // triggers first wrap
    });

    const pauseCount = engineMock.pause.mock.calls.length;

    // Natural-end fires while timeout is still pending
    act(() => { engineMock._triggerNaturalEnd(); });

    expect(engineMock.pause).toHaveBeenCalledTimes(pauseCount);
  });

  it('cancels the wrap timeout when the loop is cleared mid-beat', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12);
    });

    // Clear the loop while the beat is pending
    act(() => { result.current.dispatch({ type: 'SET_LOOP', range: null }); });

    act(() => { vi.advanceTimersByTime(LOOP_WRAP_PAUSE_MS); });

    // play should not have been called with firstStart
    expect(engineMock.play).not.toHaveBeenCalledWith(0);
  });

  it('cancels the wrap timeout on unmount', () => {
    const { result, unmount } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12);
    });

    unmount();

    act(() => { vi.advanceTimersByTime(LOOP_WRAP_PAUSE_MS); });

    expect(engineMock.play).not.toHaveBeenCalledWith(0);
  });
});

describe('stale-range clear', () => {
  it('clears loopRange when the last endpoint segment is removed', () => {
    const { result, rerender } = renderHook(
      ({ segs }: { segs: readonly Segment[] }) => usePlayer(segs, 20000, '/audio'),
      { initialProps: { segs: SEGS } },
    );

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG3.id },
      });
    });
    expect(result.current.state.loopRange).not.toBeNull();

    // Remove SEG3 — lastSegmentId is now missing
    rerender({ segs: [SEG1, SEG2] });

    expect(result.current.state.loopRange).toBeNull();
  });
});
