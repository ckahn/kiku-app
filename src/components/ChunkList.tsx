'use client';

import type { Chunk } from '@/db/schema';
import type { PlayerState } from './player/types';
import type { PlayerControls } from './player/usePlayer';
import { findActiveChunkId } from './player/chunkUtils';
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
  const activeChunkId =
    playerState.mode === 'global'
      ? findActiveChunkId(chunks, playerState.currentTime)
      : null;

  return (
    <ol className="space-y-4">
      {chunks.map((chunk) => (
        <ChunkItem
          key={chunk.id}
          chunk={chunk}
          isFocused={playerState.focusedChunkId === chunk.id}
          isActive={activeChunkId === chunk.id}
          playerState={playerState}
          controls={controls}
          podcastSlug={podcastSlug}
          episodeNumber={episodeNumber}
          episodeHref={episodeHref}
        />
      ))}
    </ol>
  );
}
