'use client';

import { useEffect, useRef } from 'react';
import type { Chunk } from '@/db/schema';
import { usePlayer } from './usePlayer';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import AudioPlayer from './AudioPlayer';
import ChunkList from '@/components/ChunkList';
import { saveEpisodeFocusState, loadEpisodeFocusState } from './studyNavigation';
import { scrollChunkToTop } from './scrollChunk';
import { findActiveChunkId } from './chunkUtils';
import { useManualScrollRestoration } from './useManualScrollRestoration';

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
  useManualScrollRestoration();
  useKeyboardShortcuts({ toggle, rewind, forward, toggleLoop });

  const { seekToChunk } = player.controls;
  const activeChunkId = findActiveChunkId(chunks, player.state.currentTime);

  // Restore the focused segment when returning from study or refreshing.
  useEffect(() => {
    if (!episodeHref || chunks.length === 0) {
      return;
    }

    const focusState = loadEpisodeFocusState(episodeHref);
    if (!focusState) {
      return;
    }

    const matchingChunk = chunks.find((chunk) => chunk.id === focusState.chunkId);
    if (!matchingChunk) {
      return;
    }

    seekToChunk(matchingChunk.id);
    scrollChunkToTop(matchingChunk.id);
  }, [chunks, episodeHref, seekToChunk]);

  // Persist the active chunk so a refresh can restore it. Skip the initial
  // mount because currentTime starts at 0, so activeChunkId is the first
  // chunk regardless of what was saved — saving it would corrupt the state.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (activeChunkId !== null && episodeHref) {
      saveEpisodeFocusState({ episodeHref, chunkId: activeChunkId });
    }
  }, [activeChunkId, episodeHref]);

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
