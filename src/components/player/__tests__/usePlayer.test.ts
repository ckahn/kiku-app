// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayer } from '../usePlayer';
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
  it('seeks back to the first segment start immediately on crossing the last segment end', () => {
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

    // No pause beat: playback jumps straight back to the first segment.
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
    engineMock.play.mockClear();

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(10); // inside SEG2, before endMs
    });

    expect(engineMock.play).not.toHaveBeenCalled();
  });

  it('does not wrap when paused at the boundary', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.play.mockClear();

    // isPlaying stays false; advance time to boundary
    act(() => { engineMock._setTime(12); });

    expect(engineMock.play).not.toHaveBeenCalled();
  });

  it('restarts from the first segment on natural file end while looping', () => {
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
    engineMock.play.mockClear();

    act(() => { engineMock._triggerNaturalEnd(); });

    expect(engineMock.play).toHaveBeenCalledWith(0);
  });

  it('clearing the loop mid-playback stops further wrapping', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    act(() => { result.current.dispatch({ type: 'SET_LOOP', range: null }); });
    engineMock.play.mockClear();

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12); // past the (now-cleared) boundary
    });

    expect(engineMock.play).not.toHaveBeenCalled();
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

describe('initial state', () => {
  it('starts paused, with no loop range, at time 0', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    expect(result.current.state.isPlaying).toBe(false);
    expect(result.current.state.loopRange).toBeNull();
    expect(result.current.state.currentTime).toBe(0);
  });
});

describe('play / pause / toggle', () => {
  it('play() calls audioEngine.play()', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.play(); });
    expect(engineMock.play).toHaveBeenCalled();
  });

  it('play() sets isPlaying when the engine confirms', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.play(); });
    expect(result.current.state.isPlaying).toBe(true);
  });

  it('pause() calls audioEngine.pause() and clears isPlaying', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.play(); });
    act(() => { result.current.controls.pause(); });
    expect(engineMock.pause).toHaveBeenCalled();
    expect(result.current.state.isPlaying).toBe(false);
  });

  it('toggle() while paused calls play', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.toggle(); });
    expect(engineMock.play).toHaveBeenCalled();
    expect(result.current.state.isPlaying).toBe(true);
  });

  it('toggle() while playing calls pause', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.play(); });
    act(() => { result.current.controls.toggle(); });
    expect(engineMock.pause).toHaveBeenCalled();
    expect(result.current.state.isPlaying).toBe(false);
  });
});

describe('engine error propagation', () => {
  it('propagates engine error to playbackError', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock._setError('Audio fetch failed: 404'); });
    expect(result.current.playbackError).toMatch(/404/);
  });
});

describe('rewind / forward', () => {
  it('rewind subtracts 5 seconds, clamped to 0', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock._setTime(3); });
    act(() => { result.current.controls.rewind(); });
    expect(engineMock.seek).toHaveBeenLastCalledWith(0);
  });

  it('forward adds 5 seconds, clamped to duration', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock._setTime(18); });
    act(() => { result.current.controls.forward(); });
    expect(engineMock.seek).toHaveBeenLastCalledWith(20);
  });

  it('forward starts from the restored segment while audio is still loading', () => {
    engineMock._setStatus('loading');
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => { result.current.controls.seekToSegment(2); });
    act(() => { result.current.controls.forward(); });

    expect(engineMock.seek).toHaveBeenLastCalledWith(9.9);
  });
});

describe('seekToSegment', () => {
  it('seeks the engine to the segment start', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.seekToSegment(2); });
    expect(engineMock.seek).toHaveBeenCalledWith(4.9); // 5000ms / 1000 - 0.1s offset
  });

  it('to the first segment seeks to 0', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.seekToSegment(1); });
    expect(engineMock.seek).toHaveBeenCalledWith(0);
  });

  it('with an unknown segment id does nothing', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.seekToSegment(999); });
    expect(engineMock.seek).not.toHaveBeenCalled();
  });

  it('updates state.currentTime synchronously', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.seekToSegment(2); });
    expect(result.current.state.currentTime).toBe(4.9);
  });
});

describe('restart', () => {
  it('calls restartAtZero and resets state to time 0, not playing', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock._setTime(15); });
    act(() => { result.current.controls.restart(); });
    expect(engineMock.restartAtZero).toHaveBeenCalledOnce();
    expect(result.current.state.currentTime).toBe(0);
    expect(result.current.state.isPlaying).toBe(false);
  });

  it('settles at 0:00 even when called while a future segment is playing', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock.play(14); });

    act(() => { result.current.controls.restart(); });

    expect(engineMock.restartAtZero).toHaveBeenCalledOnce();
    expect(engineMock.currentTime).toBe(0);
    expect(engineMock.isPlaying).toBe(false);
    expect(result.current.state.currentTime).toBe(0);
    expect(result.current.state.isPlaying).toBe(false);
  });
});

describe('shiftLoopEndpoint', () => {
  it('moves the end endpoint one segment later', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.toggleLoop(); }); // anchors to SEG1
    act(() => { result.current.controls.shiftLoopEndpoint('end', 'later'); });
    expect(result.current.state.loopRange).toEqual({ firstSegmentId: SEG1.id, lastSegmentId: SEG2.id });
  });

  it('moves the start endpoint one segment earlier (no-op at first segment)', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.toggleLoop(); }); // anchors to SEG1
    act(() => { result.current.controls.shiftLoopEndpoint('start', 'earlier'); });
    expect(result.current.state.loopRange).toEqual({ firstSegmentId: SEG1.id, lastSegmentId: SEG1.id });
  });

  it('does nothing when not looping', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.shiftLoopEndpoint('end', 'later'); });
    expect(result.current.state.loopRange).toBeNull();
  });
});

describe('segment looping — additional cases', () => {
  it('does not wrap when looping is off', () => {
    renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock.play(6); });
    engineMock.play.mockClear();
    act(() => { engineMock._setTime(12.1); });
    expect(engineMock.play).not.toHaveBeenCalled();
  });

  it('loops the new segment after seekToSegment re-anchors the loop', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => { result.current.controls.toggleLoop(); }); // anchors to SEG1 at t=0
    act(() => { engineMock.play(2); });

    act(() => { result.current.controls.seekToSegment(3); }); // re-anchors to SEG3
    engineMock.play.mockClear();

    act(() => { engineMock._setTime(20.1); });

    expect(engineMock.play).toHaveBeenCalledWith(11.9); // 12000ms / 1000 - 0.1s offset
  });

  it('pauses on natural file end when looping is off', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.play(); });
    act(() => { engineMock._triggerNaturalEnd(); });
    expect(result.current.state.isPlaying).toBe(false);
  });
});
