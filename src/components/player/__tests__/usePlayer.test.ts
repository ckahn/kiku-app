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

describe('loop boundary — pushed to the engine', () => {
  // The wrap itself is enforced on the audio rendering thread (see
  // audioEngine.test.ts). These tests prove usePlayer projects the range down
  // correctly and no longer polices it from a currentTime effect — the effect
  // that stops running when the page is hidden and the phone screen is locked.
  it('pushes the range as a loop boundary in seconds when the loop is set', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });

    // segmentStartSec(SEG1) = max(0, 0 - 0.1) = 0; SEG2.endMs / 1000 = 12
    expect(engineMock.setBoundary).toHaveBeenLastCalledWith({
      kind: 'loop',
      startSec: 0,
      endSec: 12,
    });
  });

  it('applies the 0.1s segment pre-roll to the range start', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG2.id, lastSegmentId: SEG3.id },
      });
    });

    expect(engineMock.setBoundary).toHaveBeenLastCalledWith({
      kind: 'loop',
      startSec: 4.9,
      endSec: 20,
    });
  });

  it('does not seek from React when currentTime crosses the boundary', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.play.mockClear();
    engineMock.seek.mockClear();

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12); // SEG2.endMs / 1000
    });

    expect(engineMock.play).not.toHaveBeenCalled();
    expect(engineMock.seek).not.toHaveBeenCalled();
  });

  it('clears the engine boundary when the loop is cleared', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    act(() => { result.current.dispatch({ type: 'SET_LOOP', range: null }); });

    expect(engineMock.setBoundary).toHaveBeenLastCalledWith(null);
  });

  it('pushes an updated boundary when an endpoint is dragged', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG1.id },
      });
    });
    act(() => { result.current.controls.setLoopEndpoint('end', SEG3.id); });

    expect(engineMock.setBoundary).toHaveBeenLastCalledWith({
      kind: 'loop',
      startSec: 0,
      endSec: 20,
    });
  });

  it('clears the boundary when the range goes stale as segments change', () => {
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

    rerender({ segs: [SEG1, SEG2] }); // SEG3 removed

    expect(engineMock.setBoundary).toHaveBeenLastCalledWith(null);
  });

  it('leaves the boundary alone on unmount so it cannot wipe the next page\'s', () => {
    // React mounts the incoming page before unmounting the outgoing one (see
    // the note in EpisodePlayer.tsx), so a clear-on-unmount lands *after* the
    // next page has pushed its own boundary and leaves the engine unbounded —
    // meaning "play to the end of the file" — for that whole visit. Every
    // consumer pushes a boundary on mount, so there is nothing to clean up.
    const { result, unmount } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });

    // The incoming page mounts and pushes its boundary first.
    const incoming = { kind: 'stop', endSec: 3.4 } as const;
    act(() => { engineMock.setBoundary(incoming); });

    unmount();

    expect(engineMock.boundary).toEqual(incoming);
  });

  it('restarts from the first segment on natural file end while looping', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.play.mockClear();

    act(() => { engineMock._triggerNaturalEnd(); });

    expect(engineMock.play).toHaveBeenCalledWith(0);
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

  it('seeks to the loop start segment when looping, without stopping playback', () => {
    engineMock._setTime(6); // inside SEG2
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.toggleLoop(); }); // anchors loop to SEG2
    act(() => { engineMock.play(11); }); // advance within SEG2
    act(() => { result.current.controls.restart(); });

    expect(engineMock.restartAtZero).not.toHaveBeenCalled();
    // SEG2 startMs = 5000, adjusted start = 4.9s
    expect(result.current.state.currentTime).toBeCloseTo(4.9, 1);
    expect(result.current.state.isPlaying).toBe(true);
  });

  it('does not stop playback when restarting to loop start', () => {
    engineMock._setTime(6);
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.toggleLoop(); });
    act(() => { engineMock.play(6); });
    act(() => { result.current.controls.restart(); });

    expect(engineMock.isPlaying).toBe(true);
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
  it('sets no engine boundary when looping is off', () => {
    renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { engineMock.play(6); });
    engineMock.play.mockClear();
    act(() => { engineMock._setTime(12.1); });
    expect(engineMock.play).not.toHaveBeenCalled();
    expect(engineMock.boundary).toBeNull();
  });

  it('re-anchors the engine boundary to the new segment after seekToSegment', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => { result.current.controls.toggleLoop(); }); // anchors to SEG1 at t=0
    act(() => { engineMock.play(2); });

    act(() => { result.current.controls.seekToSegment(3); }); // re-anchors to SEG3

    expect(engineMock.setBoundary).toHaveBeenLastCalledWith({
      kind: 'loop',
      startSec: 11.9, // 12000ms / 1000 - 0.1s offset
      endSec: 20,
    });
  });

  it('drops the stale loop boundary before seeking out of the range', () => {
    // play() pulls a start offset at or past loopEnd back to loopStart, so a
    // seek issued while the old boundary is still on the engine would land in
    // the old range instead of the tapped segment.
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => { result.current.controls.toggleLoop(); }); // anchors to SEG1 at t=0
    act(() => { engineMock.play(2); });
    engineMock.setBoundary.mockClear();
    engineMock.seek.mockClear();

    act(() => { result.current.controls.seekToSegment(3); });

    expect(engineMock.setBoundary).toHaveBeenNthCalledWith(1, null);
    expect(engineMock.setBoundary.mock.invocationCallOrder[0])
      .toBeLessThan(engineMock.seek.mock.invocationCallOrder[0]);
  });

  it('pauses on natural file end when looping is off', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));
    act(() => { result.current.controls.play(); });
    act(() => { engineMock._triggerNaturalEnd(); });
    expect(result.current.state.isPlaying).toBe(false);
  });
});
