'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Chunk } from '@/db/schema';
import type { PlayerState } from './player/types';
import type { PlayerControls } from './player/usePlayer';
import { findActiveChunkId } from './player/chunkUtils';
import { scrollChunkIntoView } from './player/scrollChunk';
import ChunkItem from './player/ChunkItem';

interface ChunkListProps {
  readonly chunks: readonly Chunk[];
  readonly playerState: PlayerState;
  readonly controls: PlayerControls;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function ChunkList({
  chunks,
  playerState,
  controls,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: ChunkListProps) {
  const activeChunkId = findActiveChunkId(chunks, playerState.currentTime);
  const hasScrolledOnceRef = useRef(false);
  // Mirror chunks in a ref so the scroll effect can read them without
  // depending on the chunks reference (which would re-fire the scroll).
  const chunksRef = useRef(chunks);
  useLayoutEffect(() => {
    chunksRef.current = chunks;
  });

  useEffect(() => {
    // Skip the first run so we don't fight EpisodePlayer's mount-time scroll restore.
    if (!hasScrolledOnceRef.current) {
      hasScrolledOnceRef.current = true;
      return;
    }

    if (activeChunkId === null) {
      return;
    }

    // Target the chunk AFTER the active one so both stay visible; `nearest` alone
    // on the active chunk leaves tall segments half off-screen.
    const activeIndex = chunksRef.current.findIndex((c) => c.id === activeChunkId);
    const nextChunk = chunksRef.current[activeIndex + 1];
    const targetId = nextChunk?.id ?? activeChunkId;

    scrollChunkIntoView(targetId, { block: 'nearest', behavior: 'smooth' });
  }, [activeChunkId]);

  return (
    <ol className="space-y-4 pb-4">
      {chunks.map((chunk) => (
        <ChunkItem
          key={chunk.id}
          chunk={chunk}
          isActive={activeChunkId === chunk.id}
          controls={controls}
          podcastSlug={podcastSlug}
          episodeNumber={episodeNumber}
          episodeHref={episodeHref}
        />
      ))}
    </ol>
  );
}
