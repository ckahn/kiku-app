'use client';

import { useEffect, useRef } from 'react';
import type { Segment } from '@/db/schema';
import type { PlayerState } from './player/types';
import type { PlayerControls } from './player/usePlayer';
import { findActiveSegmentId } from './player/segmentUtils';
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

  const range = playerState.loopRange;
  const sorted = [...segments].sort((a, b) => a.segmentIndex - b.segmentIndex);
  const firstBandIdx = range ? sorted.findIndex((s) => s.id === range.firstSegmentId) : -1;
  const lastBandIdx = range ? sorted.findIndex((s) => s.id === range.lastSegmentId) : -1;
  const canGrowUp = firstBandIdx > 0;
  const canGrowDown = lastBandIdx >= 0 && lastBandIdx < sorted.length - 1;

  return (
    <ol className="space-y-4 pb-4">
      {segments.map((segment) => {
        const myIdx = sorted.findIndex((s) => s.id === segment.id);
        const bandInfo = {
          inBand: firstBandIdx >= 0 && lastBandIdx >= 0 && myIdx >= firstBandIdx && myIdx <= lastBandIdx,
          isFirstInBand: firstBandIdx >= 0 && myIdx === firstBandIdx,
          isLastInBand: lastBandIdx >= 0 && myIdx === lastBandIdx,
          canGrowUp,
          canGrowDown,
        };
        return (
          <SegmentItem
            key={segment.id}
            segment={segment}
            isActive={activeSegmentId === segment.id}
            controls={controls}
            bandInfo={bandInfo}
            podcastSlug={podcastSlug}
            episodeNumber={episodeNumber}
            episodeHref={episodeHref}
          />
        );
      })}
    </ol>
  );
}
