'use client';

import { useReducer, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { Segment } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { audioEngine } from '@/lib/audio/audioEngine';
import { findActiveSegmentId, segmentStartSec } from './segmentUtils';

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

  // Tracks which segment is being looped.
  const loopSegmentRef = useRef<Segment | null>(null);

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

    if (stateRef.current.isLooping && engine.isPlaying) {
      const t = engine.currentTime;
      if (!loopSegmentRef.current) {
        // First tick with loop on: lock onto whatever segment is playing.
        // Use findActiveSegmentId so the shifted offset windows are respected.
        const activeId = findActiveSegmentId(segmentsRef.current, t);
        loopSegmentRef.current = segmentsRef.current.find((c) => c.id === activeId) ?? null;
      } else if (t >= loopSegmentRef.current.endMs / 1000) {
        audioEngine.seek(segmentStartSec(loopSegmentRef.current));
      }
    } else if (!stateRef.current.isLooping) {
      loopSegmentRef.current = null;
    }
  }, [engine.currentTime, engine.isPlaying]);

  // When the audio file reaches its natural end while looping, restart from
  // the locked segment start. This handles the edge case where endMs equals
  // file duration and the boundary enforcement above doesn't trigger in time.
  useEffect(() => {
    return audioEngine.subscribeToEnd(() => {
      if (stateRef.current.isLooping && loopSegmentRef.current) {
        audioEngine.play(segmentStartSec(loopSegmentRef.current));
      }
    });
  }, []);

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

    seek: useCallback(
      (timeSec: number) => {
        const max = audioEngine.duration > 0 ? audioEngine.duration : durationMs / 1000;
        audioEngine.seek(Math.max(0, Math.min(max, timeSec)));
      },
      [durationMs],
    ),

    rewind: useCallback(() => {
      const max = audioEngine.duration > 0 ? audioEngine.duration : durationMs / 1000;
      audioEngine.seek(Math.max(0, Math.min(max, audioEngine.currentTime - 5)));
    }, [durationMs]),

    forward: useCallback(() => {
      const max = audioEngine.duration > 0 ? audioEngine.duration : durationMs / 1000;
      audioEngine.seek(Math.max(0, Math.min(max, audioEngine.currentTime + 5)));
    }, [durationMs]),

    toggleLoop: useCallback(() => dispatch({ type: 'TOGGLE_LOOP' }), []),

    restart: useCallback(() => {
      audioEngine.pause();
      audioEngine.seek(0);
      dispatch({ type: 'RESTART', payload: 0 });
    }, []),

    seekToSegment: useCallback((segmentId: number) => {
      const segment = segments.find((c) => c.id === segmentId);
      if (segment) {
        const startSec = segmentStartSec(segment);
        audioEngine.seek(startSec);
        loopSegmentRef.current = segment;
        // Update state synchronously so the active-segment highlight applies
        // immediately without waiting for the next rAF tick.
        dispatch({ type: 'SET_TIME', payload: startSec });
      }
    }, [segments]),
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
