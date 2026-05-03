'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Play, Shuffle, Square } from 'lucide-react';
import type { RandomSegmentData } from '@/db/chunks';

interface RandomSegmentCardProps {
  readonly initialSegment: RandomSegmentData;
}

export default function RandomSegmentCard({ initialSegment }: RandomSegmentCardProps) {
  const [segment, setSegment] = useState(initialSegment);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const studyHref = `/podcasts/${segment.podcastSlug}/episodes/${segment.episodeNumber}/segments/${segment.chunkIndex}/study`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleTimeUpdate() {
      if (audio && audio.currentTime >= segment.endMs / 1000) {
        audio.pause();
      }
    }

    function handlePauseOrEnd() {
      setIsPlaying(false);
    }

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('pause', handlePauseOrEnd);
    audio.addEventListener('ended', handlePauseOrEnd);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('pause', handlePauseOrEnd);
      audio.removeEventListener('ended', handlePauseOrEnd);
    };
  }, [segment.endMs]);

  function handlePlayPause(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.src = `/api/episodes/${segment.episodeId}/audio`;
      audio.currentTime = segment.startMs / 1000;
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  }

  async function handleNewSegment(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    audioRef.current?.pause();
    setIsPlaying(false);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chunks/random');
      const json = await res.json() as { data: RandomSegmentData | null };
      if (json.data) {
        setSegment(json.data);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-surface p-4">
      <audio ref={audioRef} preload="metadata" className="hidden" />

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
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 cursor-pointer"
          aria-label={isPlaying ? 'Stop' : 'Play segment'}
        >
          {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
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
  );
}
