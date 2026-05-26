'use client';

import { useReducer, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { Chunk } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { audioEngine } from '@/lib/audio/audioEngine';
import { CHUNK_PLAYBACK_OFFSET_SEC } from '@/lib/constants';
import { findActiveChunkId } from './chunkUtils';

export type PlayerControls = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeSec: number) => void;
  rewind: () => void;
  forward: () => void;
  toggleLoop: () => void;
  restart: () => void;
  seekToChunk: (chunkId: number) => void;
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

export function usePlayer(chunks: readonly Chunk[], durationMs: number, audioUrl: string): UsePlayerReturn {
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

  // Mirror chunks in a ref so effects always see current chunks without
  // needing them in dependency arrays.
  const chunksRef = useRef(chunks);
  useLayoutEffect(() => {
    chunksRef.current = chunks;
  });

  // Tracks which chunk is being looped.
  const loopChunkRef = useRef<Chunk | null>(null);

  // Sync engine isPlaying → reducer state.
  useEffect(() => {
    if (engine.isPlaying) {
      dispatch({ type: 'PLAY' });
    } else {
      dispatch({ type: 'PAUSE' });
    }
  }, [engine.isPlaying]);

  // Sync currentTime into reducer state and enforce chunk boundary looping.
  useEffect(() => {
    dispatch({ type: 'SET_TIME', payload: engine.currentTime });

    if (stateRef.current.isLooping && engine.isPlaying) {
      const t = engine.currentTime;
      if (!loopChunkRef.current) {
        // First tick with loop on: lock onto whatever chunk is playing.
        // Use findActiveChunkId so the shifted offset windows are respected.
        const activeId = findActiveChunkId(chunksRef.current, t);
        loopChunkRef.current = chunksRef.current.find((c) => c.id === activeId) ?? null;
      } else if (t >= loopChunkRef.current.endMs / 1000) {
        audioEngine.seek(Math.max(0, loopChunkRef.current.startMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC));
      }
    } else if (!stateRef.current.isLooping) {
      loopChunkRef.current = null;
    }
  }, [engine.currentTime, engine.isPlaying]);

  // When the audio file reaches its natural end while looping, restart from
  // the locked chunk start. This handles the edge case where endMs equals
  // file duration and the boundary enforcement above doesn't trigger in time.
  useEffect(() => {
    return audioEngine.subscribeToEnd(() => {
      if (stateRef.current.isLooping && loopChunkRef.current) {
        audioEngine.play(Math.max(0, loopChunkRef.current.startMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC));
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

    seekToChunk: useCallback((chunkId: number) => {
      const chunk = chunks.find((c) => c.id === chunkId);
      if (chunk) {
        const startSec = Math.max(0, chunk.startMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC);
        audioEngine.seek(startSec);
        loopChunkRef.current = chunk;
        // Update state synchronously so the active-chunk highlight applies
        // immediately without waiting for the next rAF tick.
        dispatch({ type: 'SET_TIME', payload: startSec });
      }
    }, [chunks]),
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
