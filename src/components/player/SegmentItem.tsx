'use client';

import Link from 'next/link';
import { BookOpen, ChevronUp, ChevronDown, Minus } from 'lucide-react';
import type { Segment } from '@/db/schema';
import type { PlayerControls } from './usePlayer';
import { stripFurigana, formatMs } from './segmentUtils';
import { saveEpisodeFocusState } from './studyNavigation';
import SegmentStatusIcon from '@/components/SegmentStatusIcon';

interface BandInfo {
  readonly inBand: boolean;
  readonly isFirstInBand: boolean;
  readonly isLastInBand: boolean;
  readonly showGrowUp: boolean;
  readonly showGrowDown: boolean;
}

interface SegmentItemProps {
  readonly segment: Segment;
  readonly isActive: boolean;
  readonly controls: PlayerControls;
  readonly bandInfo?: BandInfo;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function SegmentItem({
  segment,
  isActive,
  controls,
  bandInfo,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: SegmentItemProps) {
  const {
    inBand = false,
    isFirstInBand = false,
    isLastInBand = false,
    showGrowUp = false,
    showGrowDown = false,
  } = bandInfo ?? {};

  const displayHtml = stripFurigana(segment.textFurigana);
  // 'new' renders no status glyph, so skip the indicator and its left gutter.
  const showStatusIcon = segment.studyStatus !== 'new';

  function handleClick() {
    controls.tapSegment(segment.id);
  }

  const studyHref =
    podcastSlug && episodeNumber !== undefined
      ? `/podcasts/${podcastSlug}/episodes/${episodeNumber}/segments/${segment.segmentIndex}/study`
      : null;

  return (
    <li
      data-segment-id={segment.id}
      data-active={isActive || undefined}
      data-in-loop={inBand || undefined}
      data-loop-edge={(isFirstInBand || isLastInBand) || undefined}
      onClick={handleClick}
      className={`relative rounded-lg border transition-all p-4 cursor-pointer ${
        isActive
          ? 'border-primary/60 bg-primary-subtle hover:bg-primary/10'
          : inBand
            ? 'border-border bg-primary/5 hover:border-primary/30 hover:bg-primary/10'
            : 'border-border bg-surface hover:border-primary/30 hover:bg-canvas-subtle'
      }`}
    >
      {/* Accent rail — spans the full height of each in-band card */}
      {inBand && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 bg-primary transition-opacity duration-150${
            isFirstInBand ? ' rounded-tl-lg' : ''
          }${
            isLastInBand ? ' rounded-bl-lg' : ''
          }`}
        />
      )}

      {/* Grow handle on the card directly above the band */}
      {showGrowUp && (
        <button
          type="button"
          aria-label="Expand loop up"
          onClick={(e) => { e.stopPropagation(); controls.growLoopUp(); }}
          className="absolute right-14 bottom-1 flex h-11 w-11 cursor-pointer items-center justify-center text-primary/50 hover:text-primary"
        >
          <ChevronUp size={18} />
        </button>
      )}

      {/* Grow handle on the card directly below the band */}
      {showGrowDown && (
        <button
          type="button"
          aria-label="Expand loop down"
          onClick={(e) => { e.stopPropagation(); controls.growLoopDown(); }}
          className="absolute right-14 top-1 flex h-11 w-11 cursor-pointer items-center justify-center text-primary/50 hover:text-primary"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Shrink handle: collapse the top edge (band ≥ 2) */}
      {isFirstInBand && !isLastInBand && (
        <button
          type="button"
          aria-label="Shrink loop up"
          onClick={(e) => { e.stopPropagation(); controls.shrinkLoopUp(); }}
          className="absolute right-14 top-1 flex h-11 w-11 cursor-pointer items-center justify-center text-primary/50 hover:text-primary"
        >
          <Minus size={18} />
        </button>
      )}

      {/* Shrink handle: collapse the bottom edge (band ≥ 2) */}
      {isLastInBand && !isFirstInBand && (
        <button
          type="button"
          aria-label="Shrink loop down"
          onClick={(e) => { e.stopPropagation(); controls.shrinkLoopDown(); }}
          className="absolute right-14 bottom-1 flex h-11 w-11 cursor-pointer items-center justify-center text-primary/50 hover:text-primary"
        >
          <Minus size={18} />
        </button>
      )}

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
    </li>
  );
}
