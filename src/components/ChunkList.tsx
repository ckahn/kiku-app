'use client';

import { useEffect, useRef } from 'react';
import type { Chunk } from '@/db/schema';
import type { PlayerState } from './player/types';
import type { PlayerControls } from './player/usePlayer';
import { findActiveChunkId } from './player/chunkUtils';
import { scrollChunkAboveStickyPlayer } from './player/scrollChunk';
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

  useEffect(() => {
    // Skip the first run so we don't fight EpisodePlayer's mount-time scroll restore.
    if (!hasScrolledOnceRef.current) {
      hasScrolledOnceRef.current = true;
      return;
    }

    if (activeChunkId === null) {
      return;
    }

    scrollChunkAboveStickyPlayer(activeChunkId);
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
