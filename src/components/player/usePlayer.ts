'use client';

import { useReducer, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { Segment } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { audioEngine } from '@/lib/audio/audioEngine';
import { findActiveSegmentId, segmentStartSec } from './segmentUtils';
import { makeAnchor, validateRange, setEndpoint as setLoopEndpointFn, isInRange, type Endpoint } from './loopRange';

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
  setLoopEndpoint: (which: Endpoint, segmentId: number) => void;
};

export type UsePlayerReturn = {
  state: PlayerState;
  dispatch: React.Dispatch<PlayerAction>;
  controls: PlayerControls;
  isLoading: boolean;
  durationSec: number;
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
  // On crossing the last segment's end, seek straight back to the first
  // segment's start (no pause beat). Seeking moves currentTime below the
  // boundary, so the effect won't re-fire for the same crossing.
  useEffect(() => {
    dispatch({ type: 'SET_TIME', payload: engine.currentTime });

    const range = stateRef.current.loopRange;
    if (range && engine.isPlaying) {
      const segs = segmentsRef.current;
      const lastSeg = segs.find((s) => s.id === range.lastSegmentId);
      if (lastSeg && engine.currentTime >= lastSeg.endMs / 1000) {
        const firstSeg = segs.find((s) => s.id === range.firstSegmentId);
        if (firstSeg) {
          audioEngine.play(segmentStartSec(firstSeg));
        }
      }
    }
  }, [engine.currentTime, engine.isPlaying]);

  // When the audio file reaches its natural end while looping, restart from the
  // first segment. Handles the edge case where the last segment's endMs equals
  // the file duration and the boundary check above can't catch it in time.
  useEffect(() => {
    return audioEngine.subscribeToEnd(() => {
      const range = stateRef.current.loopRange;
      if (!range) return;
      const firstSeg = segmentsRef.current.find((s) => s.id === range.firstSegmentId);
      if (!firstSeg) return;
      audioEngine.play(segmentStartSec(firstSeg));
    });
  }, []);

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
      const range = stateRef.current.loopRange;
      if (range !== null && !isInRange(segmentsRef.current, range, segmentId)) {
        dispatch({ type: 'SET_LOOP', range: makeAnchor(segmentId) });
      }
    }, [seekAndSyncState]),

    setLoopEndpoint: useCallback((which: Endpoint, segmentId: number) => {
      const range = stateRef.current.loopRange;
      if (!range) return;
      const newRange = setLoopEndpointFn(segmentsRef.current, range, which, segmentId);
      dispatch({ type: 'SET_LOOP', range: newRange });
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
    playbackError,
    clearPlaybackError,
  };
}
