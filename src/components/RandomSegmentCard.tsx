'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Play, Shuffle, Square } from 'lucide-react';
import type { RandomSegmentData } from '@/db/segments';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { audioEngine } from '@/lib/audio/audioEngine';
import { segmentStartSec } from '@/components/player/segmentUtils';

interface RandomSegmentCardProps {
  readonly initialSegment: RandomSegmentData;
}

export default function RandomSegmentCard({ initialSegment }: RandomSegmentCardProps) {
  const [segment, setSegment] = useState(initialSegment);
  // Local isPlaying is set optimistically on click so the UI responds
  // immediately, even while the engine is still fetching/decoding the buffer.
  // engine.isPlaying syncs it back when the engine eventually stops.
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shuffleError, setShuffleError] = useState(false);

  const audioUrl = `/api/episodes/${segment.episodeId}/audio`;
  const engine = useAudioEngine(audioUrl);

  const studyHref = `/podcasts/${segment.podcastSlug}/episodes/${segment.episodeNumber}/segments/${segment.segmentIndex}/study`;

  // When user clicks Play before the buffer is ready, queue the play here so
  // the auto-play effect below can fire it once the buffer finishes loading.
  const pendingPlayRef = useRef(false);

  // Auto-play as soon as the buffer is ready if one was queued.
  useEffect(() => {
    if (engine.status === 'ready' && pendingPlayRef.current) {
      pendingPlayRef.current = false;
      audioEngine.play(segmentStartSec(segment));
    }
  }, [engine.status, segment.startMs]);

  // Reset UI if loading fails while a play is queued.
  useEffect(() => {
    if (engine.error && pendingPlayRef.current) {
      pendingPlayRef.current = false;
      setIsPlaying(false);
    }
  }, [engine.error]);

  // Sync external stops (engine file ended, etc.) back to local state.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  useEffect(() => {
    if (!engine.isPlaying && isPlayingRef.current) {
      setIsPlaying(false);
    }
  }, [engine.isPlaying]);

  // Enforce segment end boundary
  useEffect(() => {
    if (!engine.isPlaying) return;
    if (engine.currentTime >= segment.endMs / 1000) {
      audioEngine.pause();
      setIsPlaying(false);
    }
  }, [engine.currentTime, engine.isPlaying, segment.endMs]);

  function handlePlayPause(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    audioEngine.unlock();

    if (isPlaying) {
      pendingPlayRef.current = false;
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (audioEngine.status === 'ready') {
        audioEngine.play(segmentStartSec(segment));
      } else {
        // Buffer still loading (or errored) — queue play and trigger/retry load.
        // The auto-play effect above fires it once status becomes 'ready'.
        pendingPlayRef.current = true;
        void audioEngine.load(audioUrl);
      }
    }
  }

  async function handleNewSegment(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    audioEngine.pause();
    pendingPlayRef.current = false;
    setIsPlaying(false);
    setShuffleError(false);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/segments/random?exclude=${segment.segmentId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { data: RandomSegmentData | null };
      if (json.data) {
        setSegment(json.data);
      }
    } catch {
      setShuffleError(true);
    } finally {
      setIsLoading(false);
    }
  }

  const isBuffering = engine.status === 'loading' && isPlaying;

  return (
    <div className="flex flex-col gap-1">
    <div className="flex items-start gap-4 rounded-lg border border-border bg-surface p-4">
      <Link href={studyHref} className="flex-1 min-w-0 hover:opacity-70 transition-opacity">
        <p className="text-lg text-ink font-jp leading-loose">{segment.textRaw}</p>
        <p className="text-xs text-muted mt-1">
          {segment.podcastName}
          <span className="mx-1.5">·</span>
          {segment.episodeTitle || `Ep. ${segment.episodeNumber}`}
        </p>
      </Link>

      <div className="flex shrink-0 items-start gap-2">
        <button
          onClick={handlePlayPause}
          disabled={isLoading}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 cursor-pointer disabled:opacity-50"
          aria-label={isPlaying ? 'Stop' : 'Play segment'}
        >
          {isBuffering
            ? <Loader2 size={16} className="animate-spin" />
            : isPlaying
              ? <Square size={16} fill="currentColor" />
              : <Play size={16} fill="currentColor" />
          }
        </button>

        <button
          onClick={handleNewSegment}
          disabled={isLoading}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50 cursor-pointer"
          aria-label="Show a different random segment"
        >
          <Shuffle size={14} />
        </button>
      </div>
    </div>
    {shuffleError && (
      <p className="text-xs text-red-500 px-1">Could not load a new segment. Try again.</p>
    )}
    </div>
  );
}
