'use client';

import { useReducer, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { Chunk } from '@/db/schema';
import { playerReducer, initialPlayerState } from './playerReducer';
import type { PlayerState, PlayerAction } from './types';

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
  seekToChunk: (chunkId: number) => void;
};

export type UsePlayerReturn = {
  state: PlayerState;
  dispatch: React.Dispatch<PlayerAction>;
  setAudioEl: (el: HTMLAudioElement | null) => void;
  controls: PlayerControls;
  playbackError: string | null;
  clearPlaybackError: () => void;
};

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

  // Mirror chunks in a ref so event listeners always see current chunks
  // without needing them in effect dependency arrays.
  const chunksRef = useRef(chunks);
  useLayoutEffect(() => {
    chunksRef.current = chunks;
  });

  // Tracks which chunk is being looped so the timeupdate handler knows
  // where to seek back when the chunk boundary is crossed.
  const loopChunkRef = useRef<Chunk | null>(null);

  // timeupdate handler — sync currentTime to state and enforce chunk looping
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleTimeUpdate() {
      const currentTimeSec = audio!.currentTime;
      dispatch({ type: 'SET_TIME', payload: currentTimeSec });

      if (stateRef.current.isLooping) {
        if (!loopChunkRef.current) {
          // Lock onto whatever chunk is currently playing when loop is first enabled
          loopChunkRef.current =
            chunksRef.current.find(
              (c) => currentTimeSec >= c.startMs / 1000 && currentTimeSec < c.endMs / 1000,
            ) ?? null;
        } else if (currentTimeSec >= loopChunkRef.current.endMs / 1000) {
          audio!.currentTime = loopChunkRef.current.startMs / 1000;
        }
      } else {
        loopChunkRef.current = null;
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [audioMounted]);

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleEnded() {
      if (stateRef.current.isLooping && loopChunkRef.current) {
        audio!.currentTime = loopChunkRef.current.startMs / 1000;
        audio!.play().catch(() => dispatch({ type: 'PAUSE' }));
      } else {
        dispatch({ type: 'PAUSE' });
      }
    }

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
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
        const audio = audioRef.current;
        if (!audio) return;
        const max = isFinite(audio.duration) ? audio.duration : durationMs / 1000;
        audio.currentTime = Math.max(0, Math.min(max, timeSec));
      },
      [durationMs],
    ),

    rewind: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const max = isFinite(audio.duration) ? audio.duration : durationMs / 1000;
      audio.currentTime = Math.max(0, Math.min(max, audio.currentTime - 5));
    }, [durationMs]),

    forward: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const max = isFinite(audio.duration) ? audio.duration : durationMs / 1000;
      audio.currentTime = Math.max(0, Math.min(max, audio.currentTime + 5));
    }, [durationMs]),

    toggleLoop: useCallback(() => dispatch({ type: 'TOGGLE_LOOP' }), []),

    restart: useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      audio.pause();
      dispatch({ type: 'RESTART', payload: 0 });
    }, []),

    seekToChunk: useCallback((chunkId: number) => {
      const chunk = chunks.find((c) => c.id === chunkId);
      if (chunk && audioRef.current) {
        const startSec = chunk.startMs / 1000;
        audioRef.current.currentTime = startSec;
        loopChunkRef.current = chunk;
        // Update state synchronously so the active-chunk highlight applies
        // immediately. Otherwise we wait for the audio element's `timeupdate`
        // event, which can stall for seconds while the browser fetches the
        // buffer for the new position (preload="metadata" ships no audio data).
        dispatch({ type: 'SET_TIME', payload: startSec });
      }
    }, [chunks]),
  };

  const clearPlaybackError = useCallback(() => setPlaybackError(null), []);

  return { state, dispatch, setAudioEl, controls, playbackError, clearPlaybackError };
}
