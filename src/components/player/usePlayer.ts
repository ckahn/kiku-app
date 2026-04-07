'use client';

import { useReducer, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import type { Chunk } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';

const CLAMP_EPSILON = 0.05; // seconds — prevent loop-point overshoot flicker

export type PlayerControls = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (timeSec: number) => void;
  rewind: () => void;
  forward: () => void;
  toggleLoop: () => void;
  restart: () => void;
  focusChunk: (chunkId: number) => void;
  unfocusChunk: () => void;
  toggleFurigana: (chunkId: number) => void;
};

export type UsePlayerReturn = {
  state: PlayerState;
  dispatch: React.Dispatch<PlayerAction>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  controls: PlayerControls;
};

function getChunkBounds(
  chunks: readonly Chunk[],
  chunkId: number | null,
): { startSec: number; endSec: number } | null {
  if (chunkId === null) return null;
  const chunk = chunks.find((c) => c.id === chunkId);
  if (!chunk) return null;
  return { startSec: chunk.startMs / 1000, endSec: chunk.endMs / 1000 };
}

export function usePlayer(chunks: readonly Chunk[], durationMs: number): UsePlayerReturn {
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep a ref to state to avoid stale closures in event listeners.
  // useLayoutEffect keeps it in sync without mutating during render.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const clampedSeek = useCallback(
    (timeSec: number, bounds: { startSec: number; endSec: number } | null) => {
      const audio = audioRef.current;
      if (!audio) return;
      const min = bounds?.startSec ?? 0;
      const max = bounds?.endSec ?? durationMs / 1000;
      audio.currentTime = Math.max(min, Math.min(max, timeSec));
    },
    [durationMs],
  );

  // timeupdate handler — clamp chunk mode and handle loop
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleTimeUpdate() {
      const s = stateRef.current;
      dispatch({ type: 'SET_TIME', payload: audio!.currentTime });

      if (s.mode !== 'chunk') return;
      const bounds = getChunkBounds(chunks, s.focusedChunkId);
      if (!bounds) return;

      const { startSec, endSec } = bounds;
      if (audio!.currentTime >= endSec - CLAMP_EPSILON) {
        if (s.isLooping) {
          audio!.currentTime = startSec;
        } else {
          audio!.pause();
          audio!.currentTime = startSec;
          dispatch({ type: 'PAUSE' });
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [chunks]);

  // When entering chunk mode, seek to chunk start
  const lastFocusedRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.mode === 'chunk' && state.focusedChunkId !== lastFocusedRef.current) {
      lastFocusedRef.current = state.focusedChunkId;
      const bounds = getChunkBounds(chunks, state.focusedChunkId);
      if (bounds && audioRef.current) {
        audioRef.current.currentTime = bounds.startSec;
      }
    }
    if (state.mode === 'global') {
      lastFocusedRef.current = null;
    }
  }, [state.mode, state.focusedChunkId, chunks]);

  const controls: PlayerControls = {
    play: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play().catch(() => dispatch({ type: 'PAUSE' }));
      dispatch({ type: 'PLAY' });
    }, []),

    pause: useCallback(() => {
      audioRef.current?.pause();
      dispatch({ type: 'PAUSE' });
    }, []),

    toggle: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      if (stateRef.current.isPlaying) {
        audio.pause();
        dispatch({ type: 'PAUSE' });
      } else {
        audio.play().catch(() => dispatch({ type: 'PAUSE' }));
        dispatch({ type: 'PLAY' });
      }
    }, []),

    seek: useCallback(
      (timeSec: number) => {
        const s = stateRef.current;
        const bounds =
          s.mode === 'chunk' ? getChunkBounds(chunks, s.focusedChunkId) : null;
        clampedSeek(timeSec, bounds);
      },
      [chunks, clampedSeek],
    ),

    rewind: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = stateRef.current;
      const bounds =
        s.mode === 'chunk' ? getChunkBounds(chunks, s.focusedChunkId) : null;
      clampedSeek(audio.currentTime - 5, bounds);
    }, [chunks, clampedSeek]),

    forward: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = stateRef.current;
      const bounds =
        s.mode === 'chunk' ? getChunkBounds(chunks, s.focusedChunkId) : null;
      clampedSeek(audio.currentTime + 5, bounds);
    }, [chunks, clampedSeek]),

    toggleLoop: useCallback(() => dispatch({ type: 'TOGGLE_LOOP' }), []),

    restart: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = stateRef.current;
      const bounds =
        s.mode === 'chunk' ? getChunkBounds(chunks, s.focusedChunkId) : null;
      audio.currentTime = bounds?.startSec ?? 0;
      audio.pause();
      dispatch({ type: 'RESTART' });
    }, [chunks]),

    focusChunk: useCallback((chunkId: number) => {
      dispatch({ type: 'FOCUS_CHUNK', payload: chunkId });
    }, []),

    unfocusChunk: useCallback(() => {
      audioRef.current?.pause();
      dispatch({ type: 'UNFOCUS_CHUNK' });
    }, []),

    toggleFurigana: useCallback((chunkId: number) => {
      dispatch({ type: 'TOGGLE_FURIGANA', payload: chunkId });
    }, []),
  };

  return { state, dispatch, audioRef, controls };
}
