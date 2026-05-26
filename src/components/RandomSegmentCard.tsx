'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Play, Shuffle, Square } from 'lucide-react';
import type { RandomSegmentData } from '@/db/chunks';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { audioEngine } from '@/lib/audio/audioEngine';

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

  const studyHref = `/podcasts/${segment.podcastSlug}/episodes/${segment.episodeNumber}/segments/${segment.chunkIndex}/study`;

  // Sync external stops (engine file ended, etc.) back to local state.
  // Only depends on engine.isPlaying so the optimistic setIsPlaying(true) from
  // handlePlayPause doesn't trigger this before the load promise resolves.
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
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      // load() is idempotent — no-op if already loaded for this URL
      void audioEngine.load(audioUrl).then(() => {
        audioEngine.play(segment.startMs / 1000);
      });
    }
  }

  async function handleNewSegment(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    audioEngine.pause();
    setIsPlaying(false);
    setShuffleError(false);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/chunks/random?exclude=${segment.chunkId}`);
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
