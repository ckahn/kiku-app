'use client';

import { useEffect } from 'react';
import type { Chunk } from '@/db/schema';
import { usePlayer } from './usePlayer';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import AudioPlayer from './AudioPlayer';
import ChunkList from '@/components/ChunkList';
import { consumeTranscriptRestoreState } from './studyNavigation';

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
  useKeyboardShortcuts({ controls: player.controls, mode: player.state.mode });

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

    player.controls.focusChunk(matchingChunk.id);

    requestAnimationFrame(() => {
      const chunkElement = document.querySelector<HTMLElement>(`[data-chunk-id="${matchingChunk.id}"]`);
      chunkElement?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }, [chunks, episodeHref, player.controls]);

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
