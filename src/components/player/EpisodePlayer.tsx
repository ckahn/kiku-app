'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Segment } from '@/db/schema';
import { usePlayer } from './usePlayer';
import { useEpisodeKeyboardShortcuts } from './useEpisodeKeyboardShortcuts';
import AudioPlayer from './AudioPlayer';
import SegmentList from '@/components/SegmentList';
import { saveEpisodeFocusState, loadEpisodeFocusState } from './studyNavigation';
import { scrollSegmentToTop } from './scrollSegment';
import { findActiveSegmentId } from './segmentUtils';
import { useManualScrollRestoration } from './useManualScrollRestoration';

interface EpisodePlayerProps {
  readonly segments: readonly Segment[];
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

function getDurationMs(durationMs: number, segments: readonly Segment[]): number {
  if (durationMs > 0) {
    return durationMs;
  }

  return segments.reduce((maxEndMs, segment) => Math.max(maxEndMs, segment.endMs), 0);
}

export default function EpisodePlayer({
  segments,
  audioUrl,
  durationMs,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: EpisodePlayerProps) {
  const effectiveDurationMs = useMemo(
    () => getDurationMs(durationMs, segments),
    [durationMs, segments],
  );
  const player = usePlayer(segments, effectiveDurationMs, audioUrl);
  const { toggle, rewind, forward, toggleLoop, restart, shiftLoopEndpoint } = player.controls;
  useManualScrollRestoration();
  const handleRestart = useCallback(() => {
    restart();

    const firstSegment = segments[0];
    if (!firstSegment) {
      return;
    }

    if (episodeHref) {
      saveEpisodeFocusState({ episodeHref, segmentId: firstSegment.id });
    }
    scrollSegmentToTop(firstSegment.id);
  }, [restart, segments, episodeHref]);

  useEpisodeKeyboardShortcuts({ toggle, rewind, forward, toggleLoop, restart: handleRestart, shiftLoopEndpoint });

  const { seekToSegment, pause } = player.controls;
  const activeSegmentId = findActiveSegmentId(segments, player.state.currentTime);
  const restoredFocusSegmentRef = useRef<number | null>(null);

  // Restore the focused segment when returning from study or refreshing.
  useEffect(() => {
    if (!episodeHref || segments.length === 0) {
      return;
    }

    const focusState = loadEpisodeFocusState(episodeHref);
    if (!focusState) {
      return;
    }

    const matchingSegment = segments.find((segment) => segment.id === focusState.segmentId);
    if (!matchingSegment) {
      return;
    }

    if (restoredFocusSegmentRef.current === matchingSegment.id) {
      return;
    }
    restoredFocusSegmentRef.current = matchingSegment.id;

    // Pause before seeking so seek() doesn't trigger play() when audio from
    // a previous page is still playing (the old page's cleanup may not have
    // run yet at this point in the navigation lifecycle).
    pause();
    seekToSegment(matchingSegment.id);
    scrollSegmentToTop(matchingSegment.id);
  }, [segments, episodeHref, pause, seekToSegment]);

  // Persist the active segment so a refresh can restore it. Skip the initial
  // mount because currentTime starts at 0, so activeSegmentId is the first
  // segment regardless of what was saved — saving it would corrupt the state.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (activeSegmentId !== null && episodeHref) {
      saveEpisodeFocusState({ episodeHref, segmentId: activeSegmentId });
    }
  }, [activeSegmentId, episodeHref]);

  return (
    <>
      <SegmentList
        segments={segments}
        playerState={player.state}
        controls={player.controls}
        podcastSlug={podcastSlug}
        episodeNumber={episodeNumber}
        episodeHref={episodeHref}
      />
      <AudioPlayer player={player} onRestart={handleRestart} />
    </>
  );
}
