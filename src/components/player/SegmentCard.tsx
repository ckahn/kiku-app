'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { Segment } from '@/db/schema';
import { stripFurigana, formatMs } from './segmentUtils';
import { saveEpisodeFocusState } from './studyNavigation';
import SegmentStatusIcon from '@/components/SegmentStatusIcon';

interface SegmentCardProps {
  readonly segment: Segment;
  readonly isActive: boolean;
  readonly isDimmed: boolean;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function SegmentCard({
  segment,
  isActive,
  isDimmed,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: SegmentCardProps) {
  const displayHtml = stripFurigana(segment.textFurigana);
  // 'new' renders no status glyph, so skip the indicator and its left gutter.
  const showStatusIcon = segment.studyStatus !== 'new';

  const studyHref =
    podcastSlug && episodeNumber !== undefined
      ? `/podcasts/${podcastSlug}/episodes/${episodeNumber}/segments/${segment.segmentIndex}/study`
      : null;

  return (
    <div
      className={`flex-1 relative rounded-lg border transition-all p-4 cursor-pointer ${
        isActive
          ? 'border-primary/60 bg-primary-subtle hover:bg-primary/10'
          : 'border-border bg-surface hover:border-primary/30 hover:bg-canvas-subtle'
      } ${isDimmed ? 'opacity-40' : ''}`}
    >
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
      <p className="text-lg text-ink font-jp leading-loose pr-7">
        {displayHtml}
      </p>
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
    </div>
  );
}
