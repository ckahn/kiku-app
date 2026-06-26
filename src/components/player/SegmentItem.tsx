'use client';

import Link from 'next/link';
import { BookOpen, ChevronUp, ChevronDown, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Segment } from '@/db/schema';
import type { PlayerControls } from './usePlayer';
import type { SegmentBandInfo } from './loopRange';
import { stripFurigana, formatMs } from './segmentUtils';
import { saveEpisodeFocusState } from './studyNavigation';
import SegmentStatusIcon from '@/components/SegmentStatusIcon';

interface SegmentItemProps {
  readonly segment: Segment;
  readonly isActive: boolean;
  readonly controls: PlayerControls;
  readonly bandInfo?: SegmentBandInfo;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

// Loop grow/shrink strip. h-11 (44px) keeps the touch target at the required
// minimum; the card reserves STRIP_PAD (> strip height) so the strip never
// overlaps the segment text.
const STRIP_HEIGHT = 'h-11';
const STRIP_PAD_TOP = 'pt-[60px]';
const STRIP_PAD_BOTTOM = 'pb-[60px]';
const STRIP_CLASS =
  `absolute inset-x-0 flex ${STRIP_HEIGHT} cursor-pointer items-center justify-center bg-primary/5 text-primary/50 transition-colors hover:bg-primary/10 hover:text-primary`;

function StripButton({
  edge,
  label,
  onActivate,
  children,
}: {
  readonly edge: 'top' | 'bottom';
  readonly label: string;
  readonly onActivate: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      className={`${STRIP_CLASS} ${edge === 'top' ? 'top-0 rounded-t-lg' : 'bottom-0 rounded-b-lg'}`}
    >
      {children}
    </button>
  );
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
    canGrowUp = false,
    canGrowDown = false,
  } = bandInfo ?? {};

  // Single-segment band: only grow strips, no shrink strips.
  // Multi-segment: edge cards get a grow strip on the outer edge and an X
  // strip on the inner edge (the side that faces the band interior).
  const isSingleSegment = isFirstInBand && isLastInBand;
  const hasTopStrip =
    (isFirstInBand && canGrowUp) ||          // ^ grow strip
    (isLastInBand && !isSingleSegment);       // x shrink strip
  const hasBottomStrip =
    (isLastInBand && canGrowDown) ||          // v grow strip
    (isFirstInBand && !isSingleSegment);      // x shrink strip

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
      className={`relative overflow-hidden rounded-lg border transition-all px-4 cursor-pointer ${
        hasTopStrip ? STRIP_PAD_TOP : 'pt-4'
      } ${
        hasBottomStrip ? STRIP_PAD_BOTTOM : 'pb-4'
      } ${
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

      {/* Top strip: ^ to grow up on the first-in-band card */}
      {isFirstInBand && canGrowUp && (
        <StripButton edge="top" label="Expand loop up" onActivate={controls.growLoopUp}>
          <ChevronUp size={16} />
        </StripButton>
      )}

      {/* Top strip: x to shrink from the top on the last-in-band card (multi-segment) */}
      {isLastInBand && !isFirstInBand && (
        <StripButton edge="top" label="Shrink loop down" onActivate={controls.shrinkLoopDown}>
          <X size={16} />
        </StripButton>
      )}

      {/* Bottom strip: x to shrink from the bottom on the first-in-band card (multi-segment) */}
      {isFirstInBand && !isLastInBand && (
        <StripButton edge="bottom" label="Shrink loop up" onActivate={controls.shrinkLoopUp}>
          <X size={16} />
        </StripButton>
      )}

      {/* Bottom strip: v to grow down on the last-in-band card */}
      {isLastInBand && canGrowDown && (
        <StripButton edge="bottom" label="Expand loop down" onActivate={controls.growLoopDown}>
          <ChevronDown size={16} />
        </StripButton>
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
          className={`absolute right-2 flex h-11 w-11 cursor-pointer items-start justify-center pt-2 text-muted transition-colors hover:text-primary ${
            hasTopStrip ? 'top-11' : 'top-2'
          }`}
          aria-label="Study this segment"
        >
          <BookOpen size={16} />
        </Link>
      )}
    </li>
  );
}
