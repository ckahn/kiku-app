'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { audioEngine } from '@/lib/audio/audioEngine';
import type { AudioStatus } from '@/lib/audio/audioEngine';

export type UseAudioEngineReturn = {
  status: AudioStatus;
  isPlaying: boolean;
  currentTime: number;
  durationSec: number;
  error: string | null;
  controls: {
    play: (startSec?: number) => void;
    pause: () => void;
    seek: (sec: number) => void;
    setPlaybackRate: (rate: number) => void;
  };
};

export function useAudioEngine(url: string): UseAudioEngineReturn {
  const [status, setStatus] = useState<AudioStatus>(audioEngine.status);
  const [isPlaying, setIsPlaying] = useState(audioEngine.isPlaying);
  const [currentTime, setCurrentTime] = useState(audioEngine.currentTime);
  const [durationSec, setDurationSec] = useState(audioEngine.duration);
  const [error, setError] = useState<string | null>(audioEngine.error);
  const rafRef = useRef<number | null>(null);

  // Subscribe to engine state changes
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(() => {
      setStatus(audioEngine.status);
      setIsPlaying(audioEngine.isPlaying);
      setCurrentTime(audioEngine.currentTime);
      setDurationSec(audioEngine.duration);
      setError(audioEngine.error);
    });
    return unsubscribe;
  }, []);

  // rAF loop for smooth currentTime updates while playing
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    function tick() {
      setCurrentTime(audioEngine.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  // Pause on unmount so audio stops when navigating away.
  useEffect(() => {
    return () => { audioEngine.pause(); };
  }, []);

  // Load when URL changes
  useEffect(() => {
    if (!url) return;
    void audioEngine.load(url);
  }, [url]);

  const controls = {
    play: useCallback((startSec?: number) => {
      audioEngine.unlock();
      audioEngine.play(startSec);
    }, []),
    pause: useCallback(() => audioEngine.pause(), []),
    seek: useCallback((sec: number) => audioEngine.seek(sec), []),
    setPlaybackRate: useCallback((rate: number) => audioEngine.setPlaybackRate(rate), []),
  };

  return {
    status,
    isPlaying,
    currentTime,
    durationSec,
    error,
    controls,
  };
}
