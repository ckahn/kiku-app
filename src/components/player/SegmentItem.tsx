'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { Segment } from '@/db/schema';
import type { PlayerControls } from './usePlayer';
import { stripFurigana } from './segmentUtils';
import { saveEpisodeFocusState } from './studyNavigation';
import SegmentStatusIcon from '@/components/SegmentStatusIcon';

interface SegmentItemProps {
  readonly segment: Segment;
  readonly isActive: boolean;
  readonly controls: PlayerControls;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function SegmentItem({
  segment,
  isActive,
  controls,
  podcastSlug,
  episodeNumber,
  episodeHref,
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

  return (
    <li
      data-segment-id={segment.id}
      data-active={isActive || undefined}
      onClick={handleClick}
      className={`relative rounded-lg border transition-all p-4 cursor-pointer ${
        isActive
          ? 'border-primary/60 bg-primary-subtle hover:bg-primary/10'
          : 'border-border bg-surface hover:border-primary/30 hover:bg-canvas-subtle'
      }`}
    >
      {showStatusIcon && (
        <span className="absolute left-2 top-4 flex items-center" title={`Status: ${segment.studyStatus}`}>
          <SegmentStatusIcon status={segment.studyStatus} />
        </span>
      )}
      <p
        className={`text-lg text-ink font-jp leading-loose pr-7 ${showStatusIcon ? 'pl-7' : ''}`}
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
          className="absolute right-2 top-2 flex h-11 w-11 cursor-pointer items-center justify-center text-muted transition-colors hover:text-primary"
          aria-label="Study this segment"
        >
          <BookOpen size={16} />
        </Link>
      )}
    </li>
  );
}
