'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { Segment } from '@/db/schema';
import type { PlayerControls } from './usePlayer';
import { stripFurigana, formatMs } from './segmentUtils';
import { saveEpisodeFocusState } from './studyNavigation';
import SegmentStatusIcon from '@/components/SegmentStatusIcon';

interface SegmentItemProps {
  readonly segment: Segment;
  readonly isActive: boolean;
  readonly controls: PlayerControls;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
  readonly isLooping?: boolean;
  readonly inRange?: boolean;
  readonly isRangeStart?: boolean;
  readonly isRangeEnd?: boolean;
  readonly onStartHandlePointerDown?: (e: React.PointerEvent) => void;
  readonly onEndHandlePointerDown?: (e: React.PointerEvent) => void;
}

export default function SegmentItem({
  segment,
  isActive,
  controls,
  podcastSlug,
  episodeNumber,
  episodeHref,
  isLooping = false,
  inRange = false,
  isRangeStart = false,
  isRangeEnd = false,
  onStartHandlePointerDown,
  onEndHandlePointerDown,
}: SegmentItemProps) {
  const displayHtml = stripFurigana(segment.textFurigana);
  // 'new' renders no status glyph, so skip the indicator and its left gutter.
  const showStatusIcon = segment.studyStatus !== 'new';

  function handleClick() {
    controls.seekToSegment(segment.id);
  }

  const studyHref =
    podcastSlug && episodeNumber !== undefined
      ? `/podcasts/${podcastSlug}/episodes/${episodeNumber}/segments/${segment.segmentIndex}/study`
      : null;

  const cardClasses = `relative rounded-lg border transition-all p-4 cursor-pointer ${
    isActive
      ? 'border-primary/60 bg-primary-subtle hover:bg-primary/10'
      : 'border-border bg-surface hover:border-primary/30 hover:bg-canvas-subtle'
  } ${isLooping && !inRange ? 'opacity-40' : ''}`;

  const cardContent = (
    <>
      <div className="flex items-center gap-1.5 mb-2">
        {showStatusIcon && (
          <span className="flex items-center shrink-0" title={`Status: ${segment.studyStatus}`}>
            <SegmentStatusIcon status={segment.studyStatus} />
          </span>
        )}
        <span className="text-xs text-muted font-mono">
          {formatMs(segment.startMs)}
        </span>
      </div>
      <p
        className="text-lg text-ink font-jp leading-loose pr-7"
        // textFurigana is Claude-generated HTML containing only <ruby>/<rt> tags.
        // It is not user-supplied input.
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
      {studyHref && (
        <Link
          href={studyHref}
          onClick={(e) => {
            e.stopPropagation();
            if (episodeHref) {
              saveEpisodeFocusState({ episodeHref, segmentId: segment.id });
            }
          }}
          className="absolute right-2 top-2 flex h-11 w-11 cursor-pointer items-start justify-center pt-2 text-muted transition-colors hover:text-primary"
          aria-label="Study this segment"
        >
          <BookOpen size={16} />
        </Link>
      )}
    </>
  );

  return (
    <li
      data-segment-id={segment.id}
      data-active={isActive || undefined}
      onClick={handleClick}
      className={isLooping ? 'flex items-stretch gap-2' : cardClasses}
    >
      {isLooping && (
        <div
          data-gutter-id={segment.id}
          className="relative flex w-11 shrink-0 items-center justify-center"
          aria-hidden
          onClick={(e) => e.stopPropagation()}
        >
          {/* Faint full-height track so the gutter reads as a column. */}
          <span className="absolute inset-y-0 w-1.5 rounded-full bg-border/50" />
          {/* Filled bar for in-range cells; capped only at the endpoints. */}
          {inRange && (
            <span
              className={`absolute inset-y-0 w-1.5 bg-primary ${isRangeStart ? 'rounded-t-full' : ''} ${isRangeEnd ? 'rounded-b-full' : ''}`}
            />
          )}
          {/* Start handle on the first in-range cell. */}
          {inRange && isRangeStart && (
            <button
              type="button"
              onPointerDown={onStartHandlePointerDown}
              aria-label="Drag to move loop start"
              style={{ touchAction: 'none' }}
              className="absolute -top-1 flex h-11 w-11 cursor-grab items-start justify-center active:cursor-grabbing"
            >
              <span className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
            </button>
          )}
          {/* End handle on the last in-range cell. */}
          {inRange && isRangeEnd && (
            <button
              type="button"
              onPointerDown={onEndHandlePointerDown}
              aria-label="Drag to move loop end"
              style={{ touchAction: 'none' }}
              className="absolute -bottom-1 flex h-11 w-11 cursor-grab items-end justify-center active:cursor-grabbing"
            >
              <span className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
            </button>
          )}
        </div>
      )}
      {isLooping ? (
        <div className={`flex-1 ${cardClasses}`}>
          {cardContent}
        </div>
      ) : (
        cardContent
      )}
    </li>
  );
}
