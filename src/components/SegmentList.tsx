'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Segment } from '@/db/schema';
import type { PlayerState } from './player/types';
import type { PlayerControls } from './player/usePlayer';
import { findActiveSegmentId } from './player/segmentUtils';
import { computeBandInfo } from './player/loopRange';
import { scrollSegmentIntoVisibleArea } from './player/scrollSegment';
import SegmentItem from './player/SegmentItem';

interface SegmentListProps {
  readonly segments: readonly Segment[];
  readonly playerState: PlayerState;
  readonly controls: PlayerControls;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function SegmentList({
  segments,
  playerState,
  controls,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: SegmentListProps) {
  const activeSegmentId = findActiveSegmentId(segments, playerState.currentTime);
  const hasScrolledOnceRef = useRef(false);

  useEffect(() => {
    // Skip the first run so we don't fight EpisodePlayer's mount-time scroll restore.
    if (!hasScrolledOnceRef.current) {
      hasScrolledOnceRef.current = true;
      return;
    }

    if (activeSegmentId === null) {
      return;
    }

    scrollSegmentIntoVisibleArea(activeSegmentId);
  }, [activeSegmentId]);

  // Single source of truth for band geometry (loopRange.ts), recomputed only
  // when the segment list or the loop range changes — not on every time tick.
  const bandInfoBySegmentId = useMemo(
    () => computeBandInfo(segments, playerState.loopRange),
    [segments, playerState.loopRange],
  );

  return (
    <ol className="space-y-4 pb-4">
      {segments.map((segment) => (
        <SegmentItem
          key={segment.id}
          segment={segment}
          isActive={activeSegmentId === segment.id}
          controls={controls}
          bandInfo={bandInfoBySegmentId.get(segment.id)}
          podcastSlug={podcastSlug}
          episodeNumber={episodeNumber}
          episodeHref={episodeHref}
        />
      ))}
    </ol>
  );
}
