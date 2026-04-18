'use client';

import { useEffect } from 'react';
import type { Chunk } from '@/db/schema';
import { usePlayer } from './usePlayer';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import AudioPlayer from './AudioPlayer';
import ChunkList from '@/components/ChunkList';
import { consumeTranscriptRestoreState } from './studyNavigation';
import { scrollChunkIntoView } from './scrollChunk';

interface EpisodePlayerProps {
  readonly chunks: readonly Chunk[];
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function EpisodePlayer({
  chunks,
  audioUrl,
  durationMs,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: EpisodePlayerProps) {
  const player = usePlayer(chunks, durationMs);
  const { toggle, rewind, forward, toggleLoop } = player.controls;
  useKeyboardShortcuts({ toggle, rewind, forward, toggleLoop });

  const { seekToChunk } = player.controls;

  useEffect(() => {
    if (!episodeHref || chunks.length === 0) {
      return;
    }

    const restoreState = consumeTranscriptRestoreState(episodeHref);
    if (!restoreState) {
      return;
    }

    const matchingChunk = chunks.find((chunk) => chunk.id === restoreState.chunkId);
    if (!matchingChunk) {
      return;
    }

    seekToChunk(matchingChunk.id);
    scrollChunkIntoView(matchingChunk.id, { block: 'start', behavior: 'auto' });
  }, [chunks, episodeHref, seekToChunk]);

  return (
    <>
      <ChunkList
        chunks={chunks}
        playerState={player.state}
        controls={player.controls}
        podcastSlug={podcastSlug}
        episodeNumber={episodeNumber}
        episodeHref={episodeHref}
      />
      <AudioPlayer audioUrl={audioUrl} durationMs={durationMs} player={player} />
    </>
  );
}
