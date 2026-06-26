'use client';

import { useReducer, useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import type { Segment } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { audioEngine } from '@/lib/audio/audioEngine';
import { findActiveSegmentId, segmentStartSec } from './segmentUtils';
import type { LoopRange } from './loopRange';
import { makeAnchor, validateRange, growUp, growDown, shrinkUp, shrinkDown, isInRange, rangeLength } from './loopRange';
import { LOOP_WRAP_PAUSE_MS } from '@/lib/constants';

export type PlayerControls = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeSec: number) => void;
  rewind: () => void;
  forward: () => void;
  toggleLoop: () => void;
  restart: () => void;
  seekToSegment: (segmentId: number) => void;
  tapSegment: (segmentId: number) => void;
  growLoopUp: () => void;
  growLoopDown: () => void;
  shrinkLoopUp: () => void;
  shrinkLoopDown: () => void;
  clearLoop: () => void;
};

export type UsePlayerReturn = {
  state: PlayerState;
  dispatch: React.Dispatch<PlayerAction>;
  controls: PlayerControls;
  isLoading: boolean;
  durationSec: number;
  loopLength: number;
  playbackError: string | null;
  clearPlaybackError: () => void;
};

export function usePlayer(segments: readonly Segment[], durationMs: number, audioUrl: string): UsePlayerReturn {
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  // Tracks the last error value that was acknowledged (dismissed) by the user,
  // so the engine-error effect doesn't re-surface the same error after
  // clearPlaybackError() is called.
  const acknowledgedErrorRef = useRef<string | null>(null);

  const engine = useAudioEngine(audioUrl);

  // Keep a ref to state to avoid stale closures in effects and callbacks.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  // Mirror segments in a ref so effects always see current segments without
  // needing them in dependency arrays.
  const segmentsRef = useRef(segments);

  // Pending wrap-pause timeout — non-null while the beat between loop
  // iterations is in progress. Guards against re-entrant wraps.
  const wrapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    segmentsRef.current = segments;
  });

  // Sync engine isPlaying → reducer state.
  useEffect(() => {
    if (engine.isPlaying) {
      dispatch({ type: 'PLAY' });
    } else {
      dispatch({ type: 'PAUSE' });
    }
  }, [engine.isPlaying]);

  // Sync currentTime into reducer state and enforce segment boundary looping.
  useEffect(() => {
    dispatch({ type: 'SET_TIME', payload: engine.currentTime });

    const range = stateRef.current.loopRange;
    if (range && engine.isPlaying && wrapTimeoutRef.current === null) {
      const segs = segmentsRef.current;
      const lastSeg = segs.find((s) => s.id === range.lastSegmentId);
      if (lastSeg && engine.currentTime >= lastSeg.endMs / 1000) {
        const firstSeg = segs.find((s) => s.id === range.firstSegmentId);
        if (firstSeg) {
          const firstStart = segmentStartSec(firstSeg);
          audioEngine.pause();
          wrapTimeoutRef.current = setTimeout(() => {
            wrapTimeoutRef.current = null;
            audioEngine.play(firstStart);
          }, LOOP_WRAP_PAUSE_MS);
        }
      }
    }
  }, [engine.currentTime, engine.isPlaying]);

  // When the audio file reaches its natural end while looping, restart from
  // the first segment with the same pause beat. This handles the edge case
  // where endMs equals file duration and the boundary check above doesn't
  // trigger in time.
  useEffect(() => {
    return audioEngine.subscribeToEnd(() => {
      if (wrapTimeoutRef.current !== null) return;
      const range = stateRef.current.loopRange;
      if (!range) return;
      const firstSeg = segmentsRef.current.find((s) => s.id === range.firstSegmentId);
      if (!firstSeg) return;
      const firstStart = segmentStartSec(firstSeg);
      audioEngine.pause();
      wrapTimeoutRef.current = setTimeout(() => {
        wrapTimeoutRef.current = null;
        audioEngine.play(firstStart);
      }, LOOP_WRAP_PAUSE_MS);
    });
  }, []);

  // Cancel any pending wrap timeout when the loop is cleared or the hook unmounts.
  useEffect(() => {
    if (state.loopRange === null && wrapTimeoutRef.current !== null) {
      clearTimeout(wrapTimeoutRef.current);
      wrapTimeoutRef.current = null;
    }
    return () => {
      if (wrapTimeoutRef.current !== null) {
        clearTimeout(wrapTimeoutRef.current);
      }
    };
  }, [state.loopRange]);

  // Drop a stale loopRange when segments change (e.g. after re-segmentation).
  useEffect(() => {
    const range = stateRef.current.loopRange;
    if (!range) return;
    if (!validateRange(segments, range)) {
      dispatch({ type: 'SET_LOOP', range: null });
    }
  }, [segments]);

  // Surface engine errors as playbackError strings, unless the user has
  // already dismissed this exact error via clearPlaybackError(). Subscribe
  // directly to the engine so setState is called from a subscription callback
  // rather than the effect body, avoiding cascading React renders.
  useEffect(() => {
    return audioEngine.subscribe(() => {
      const err = audioEngine.error;
      if (err && err !== acknowledgedErrorRef.current) {
        setPlaybackError(err);
      }
    });
  }, []);

  const seekAndSyncState = useCallback(
    (timeSec: number) => {
      const max = audioEngine.duration > 0 ? audioEngine.duration : durationMs / 1000;
      const clampedTime = Math.max(0, Math.min(max, timeSec));
      audioEngine.seek(clampedTime);
      dispatch({ type: 'SET_TIME', payload: clampedTime });
    },
    [durationMs],
  );

  // The four grow/shrink controls differ only in which pure loopRange helper
  // they apply, so share one factory: read the current range, run the mutator,
  // and dispatch the result when it produces a new (non-null) range.
  const makeLoopMutator = useCallback(
    (mutate: (segs: readonly Segment[], range: LoopRange) => LoopRange | null) => () => {
      const range = stateRef.current.loopRange;
      if (!range) return;
      const next = mutate(segmentsRef.current, range);
      if (next) dispatch({ type: 'SET_LOOP', range: next });
    },
    [],
  );

  const controls: PlayerControls = {
    play: useCallback(() => {
      setPlaybackError(null);
      audioEngine.unlock();
      audioEngine.play();
    }, []),

    pause: useCallback(() => {
      audioEngine.pause();
    }, []),

    toggle: useCallback(() => {
      audioEngine.unlock();
      if (stateRef.current.isPlaying) {
        audioEngine.pause();
      } else {
        setPlaybackError(null);
        audioEngine.play();
      }
    }, []),

    seek: seekAndSyncState,

    rewind: useCallback(() => {
      seekAndSyncState(stateRef.current.currentTime - 5);
    }, [seekAndSyncState]),

    forward: useCallback(() => {
      seekAndSyncState(stateRef.current.currentTime + 5);
    }, [seekAndSyncState]),

    toggleLoop: useCallback(() => {
      if (stateRef.current.loopRange === null) {
        const activeId = findActiveSegmentId(segmentsRef.current, stateRef.current.currentTime);
        if (activeId !== null) {
          dispatch({ type: 'SET_LOOP', range: makeAnchor(activeId) });
        }
      } else {
        dispatch({ type: 'SET_LOOP', range: null });
      }
    }, []),

    restart: useCallback(() => {
      audioEngine.restartAtZero();
      dispatch({ type: 'RESTART', payload: 0 });
    }, []),

    seekToSegment: useCallback((segmentId: number) => {
      const segment = segmentsRef.current.find((c) => c.id === segmentId);
      if (!segment) return;
      seekAndSyncState(segmentStartSec(segment));
      if (stateRef.current.loopRange !== null) {
        dispatch({ type: 'SET_LOOP', range: makeAnchor(segmentId) });
      }
    }, [seekAndSyncState]),

    // The card-body tap. Semantics depend on loop state per the spec table:
    //   loop off          → pure seek (unchanged behavior)
    //   inside band       → seek only; range untouched
    //   outside band      → clear loop + seek
    tapSegment: useCallback((segmentId: number) => {
      const range = stateRef.current.loopRange;
      const segs = segmentsRef.current;
      const segment = segs.find((s) => s.id === segmentId);
      if (!segment) return;
      const startSec = segmentStartSec(segment);

      if (range === null || isInRange(segs, range, segmentId)) {
        seekAndSyncState(startSec);
      } else {
        // Outside band — cancel any pending wrap beat before clearing
        if (wrapTimeoutRef.current !== null) {
          clearTimeout(wrapTimeoutRef.current);
          wrapTimeoutRef.current = null;
        }
        dispatch({ type: 'SET_LOOP', range: null });
        seekAndSyncState(startSec);
      }
    }, [seekAndSyncState]),

    growLoopUp: useMemo(() => makeLoopMutator(growUp), [makeLoopMutator]),
    growLoopDown: useMemo(() => makeLoopMutator(growDown), [makeLoopMutator]),
    shrinkLoopUp: useMemo(() => makeLoopMutator(shrinkUp), [makeLoopMutator]),
    shrinkLoopDown: useMemo(() => makeLoopMutator(shrinkDown), [makeLoopMutator]),

    clearLoop: useCallback(() => {
      if (wrapTimeoutRef.current !== null) {
        clearTimeout(wrapTimeoutRef.current);
        wrapTimeoutRef.current = null;
      }
      dispatch({ type: 'SET_LOOP', range: null });
    }, []),
  };

  const clearPlaybackError = useCallback(() => {
    acknowledgedErrorRef.current = engine.error;
    setPlaybackError(null);
  }, [engine.error]);

  return {
    state,
    dispatch,
    controls,
    isLoading: engine.status === 'loading',
    durationSec: engine.durationSec > 0 ? engine.durationSec : durationMs / 1000,
    loopLength: state.loopRange ? rangeLength(segments, state.loopRange) : 0,
    playbackError,
    clearPlaybackError,
  };
}
