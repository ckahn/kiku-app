'use client';

import type { Chunk } from '@/db/schema';
import { usePlayer } from './usePlayer';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import AudioPlayer from './AudioPlayer';
import ChunkList from '@/components/ChunkList';

interface EpisodePlayerProps {
  readonly chunks: readonly Chunk[];
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
}

export default function EpisodePlayer({
  chunks,
  audioUrl,
  durationMs,
  podcastSlug,
  episodeNumber,
}: EpisodePlayerProps) {
  const player = usePlayer(chunks, durationMs);
  useKeyboardShortcuts({ controls: player.controls, mode: player.state.mode });

  return (
    <>
      <ChunkList
        chunks={chunks}
        playerState={player.state}
        controls={player.controls}
        podcastSlug={podcastSlug}
        episodeNumber={episodeNumber}
      />
      <AudioPlayer audioUrl={audioUrl} durationMs={durationMs} player={player} />
    </>
  );
}
