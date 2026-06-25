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
  it('seeks to first segment start when current time reaches last segment end', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.seek.mockClear();

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(12); // SEG2.endMs / 1000
    });

    // segmentStartSec(SEG1) = max(0, 0/1000 - 0.1) = 0
    expect(engineMock.seek).toHaveBeenCalledWith(0);
  });

  it('does not seek when not past the last segment end', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.seek.mockClear();

    act(() => {
      engineMock._setIsPlaying(true);
      engineMock._setTime(10); // inside SEG2, before endMs
    });

    expect(engineMock.seek).not.toHaveBeenCalled();
  });

  it('does not seek when paused at the boundary', () => {
    const { result } = renderHook(() => usePlayer(SEGS, 20000, '/audio'));

    act(() => {
      result.current.dispatch({
        type: 'SET_LOOP',
        range: { firstSegmentId: SEG1.id, lastSegmentId: SEG2.id },
      });
    });
    engineMock.seek.mockClear();

    // isPlaying stays false; advance time to boundary
    act(() => { engineMock._setTime(12); });

    expect(engineMock.seek).not.toHaveBeenCalled();
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
