'use client';

import { useEffect, useRef } from 'react';
import type { Segment } from '@/db/schema';
import type { PlayerState } from './player/types';
import type { PlayerControls } from './player/usePlayer';
import type { LoopRange, Endpoint } from './player/loopRange';
import { findActiveSegmentId } from './player/segmentUtils';
import { scrollSegmentIntoVisibleArea } from './player/scrollSegment';
import { useLoopDrag } from './player/useLoopDrag';
import SegmentItem from './player/SegmentItem';

interface SegmentListProps {
  readonly segments: readonly Segment[];
  readonly playerState: PlayerState;
  readonly controls: PlayerControls;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

function buildRangeSet(segments: readonly Segment[], range: LoopRange): Set<number> {
  const firstIdx = segments.findIndex((s) => s.id === range.firstSegmentId);
  const lastIdx = segments.findIndex((s) => s.id === range.lastSegmentId);
  if (firstIdx === -1 || lastIdx === -1) return new Set();
  const ids = new Set<number>();
  for (let i = firstIdx; i <= lastIdx; i++) {
    ids.add(segments[i].id);
  }
  return ids;
}

function makeHandleKeyDown(
  which: Endpoint,
  segments: readonly Segment[],
  controls: PlayerControls,
) {
  return (e: React.KeyboardEvent) => {
    const isArrowEarlier = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    const isArrowLater = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const isHome = e.key === 'Home';
    const isEnd = e.key === 'End';
    if (!isArrowEarlier && !isArrowLater && !isHome && !isEnd) return;

    e.preventDefault();
    e.stopPropagation();

    if (isArrowEarlier) {
      controls.shiftLoopEndpoint(which, 'earlier');
    } else if (isArrowLater) {
      controls.shiftLoopEndpoint(which, 'later');
    } else {
      const sorted = [...segments].sort((a, b) => a.segmentIndex - b.segmentIndex);
      if (sorted.length === 0) return;
      const targetId = isHome ? sorted[0].id : sorted[sorted.length - 1].id;
      controls.setLoopEndpoint(which, targetId);
    }
  };
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

  const loopRange = playerState.loopRange;
  const isLooping = loopRange !== null;
  const rangeSet = loopRange ? buildRangeSet(segments, loopRange) : null;

  const { dragging, handlePointerDown } = useLoopDrag(controls.setLoopEndpoint);

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

  return (
    <ol className={`space-y-4 pb-4 ${dragging ? 'select-none' : ''}`}>
      {segments.map((segment) => {
        const inRange = rangeSet ? rangeSet.has(segment.id) : false;
        const isRangeStart = segment.id === loopRange?.firstSegmentId;
        const isRangeEnd = segment.id === loopRange?.lastSegmentId;
        return (
          <SegmentItem
            key={segment.id}
            segment={segment}
            isActive={activeSegmentId === segment.id}
            controls={controls}
            podcastSlug={podcastSlug}
            episodeNumber={episodeNumber}
            episodeHref={episodeHref}
            isLooping={isLooping}
            inRange={inRange}
            isRangeStart={isRangeStart}
            isRangeEnd={isRangeEnd}
            onStartHandlePointerDown={(e) => handlePointerDown('start', e)}
            onEndHandlePointerDown={(e) => handlePointerDown('end', e)}
            onStartHandleKeyDown={makeHandleKeyDown('start', segments, controls)}
            onEndHandleKeyDown={makeHandleKeyDown('end', segments, controls)}
          />
        );
      })}
    </ol>
  );
}
