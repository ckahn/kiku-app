'use client';

import { useReducer, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { Chunk } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';

const CLAMP_EPSILON = 0.05; // seconds — prevent loop-point overshoot flicker
export const CHUNK_PLAYBACK_OFFSET_SEC = 0.2; // seconds — trim chunk playback slightly earlier at both edges
const GENERIC_PLAYBACK_ERROR =
  'Could not play this episode audio. Try again or refresh the page. If it keeps failing, the audio file may be unavailable.';

function getPlaybackErrorMessage(audio: HTMLAudioElement | null, error?: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Playback was blocked by the browser. Try clicking play again.';
  }

  if (audio?.error?.code === 1) {
    return 'Audio playback was interrupted. Try playing the episode again.';
  }

  return GENERIC_PLAYBACK_ERROR;
}

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
  setAudioEl: (el: HTMLAudioElement | null) => void;
  controls: PlayerControls;
  playbackError: string | null;
  clearPlaybackError: () => void;
};

function getChunkBounds(
  chunks: readonly Chunk[],
  chunkId: number | null,
): { startSec: number; endSec: number } | null {
  if (chunkId === null) return null;
  const chunk = chunks.find((c) => c.id === chunkId);
  if (!chunk) return null;
  // Apply a small player-only offset so focused chunk playback starts and
  // loops a touch earlier than the stored DB timestamps.
  const startSec = Math.max(0, chunk.startMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC);
  const endSec = Math.max(startSec, chunk.endMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC);
  return { startSec, endSec };
}

export function usePlayer(chunks: readonly Chunk[], durationMs: number): UsePlayerReturn {
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioMounted, setAudioMounted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Callback ref exposed to the <audio> element. Storing the element in both
  // the ref (for synchronous imperative access) and as state (to re-trigger
  // the timeupdate useEffect) guarantees the listener is attached regardless
  // of component render order.
  const setAudioEl = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
    setAudioMounted(el !== null);
  }, []);

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
      const max = bounds?.endSec ?? (isFinite(audio.duration) ? audio.duration : durationMs / 1000);
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
          dispatch({ type: 'EXIT_CHUNK_PLAYING' });
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [chunks, audioMounted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleError() {
      dispatch({ type: 'PAUSE' });
      setPlaybackError(getPlaybackErrorMessage(audio));
    }

    audio.addEventListener('error', handleError);
    return () => audio.removeEventListener('error', handleError);
  }, [audioMounted]);

  const controls: PlayerControls = {
    play: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setPlaybackError(null);
      audio.play()
        .then(() => {
          setPlaybackError(null);
          dispatch({ type: 'PLAY' });
        })
        .catch((error) => {
          setPlaybackError(getPlaybackErrorMessage(audio, error));
          dispatch({ type: 'PAUSE' });
        });
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
        setPlaybackError(null);
        audio.play()
          .then(() => {
            setPlaybackError(null);
            dispatch({ type: 'PLAY' });
          })
          .catch((error) => {
            setPlaybackError(getPlaybackErrorMessage(audio, error));
            dispatch({ type: 'PAUSE' });
          });
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
      const targetSec = bounds?.startSec ?? 0;
      audio.currentTime = targetSec;
      audio.pause();
      dispatch({ type: 'RESTART', payload: targetSec });
    }, [chunks]),

    focusChunk: useCallback((chunkId: number) => {
      // Dispatch first so stateRef is queued to update before any subsequent
      // timeupdate event can fire against the stale focusedChunkId.
      dispatch({ type: 'FOCUS_CHUNK', payload: chunkId });
      const bounds = getChunkBounds(chunks, chunkId);
      if (bounds && audioRef.current) {
        audioRef.current.currentTime = bounds.startSec;
      }
    }, [chunks]),

    unfocusChunk: useCallback(() => {
      audioRef.current?.pause();
      dispatch({ type: 'UNFOCUS_CHUNK' });
    }, []),

    toggleFurigana: useCallback((chunkId: number) => {
      dispatch({ type: 'TOGGLE_FURIGANA', payload: chunkId });
    }, []),
  };

  const clearPlaybackError = useCallback(() => setPlaybackError(null), []);

  return { state, dispatch, setAudioEl, controls, playbackError, clearPlaybackError };
}
