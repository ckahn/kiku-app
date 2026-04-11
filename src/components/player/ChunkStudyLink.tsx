'use client';

import Link from 'next/link';
import { saveTranscriptRestoreState } from './studyNavigation';

interface ChunkStudyLinkProps {
  readonly chunkId: number;
  readonly podcastSlug: string;
  readonly episodeNumber: number;
  readonly chunkIndex: number;
  readonly episodeHref?: string;
}

export default function ChunkStudyLink({
  chunkId,
  podcastSlug,
  episodeNumber,
  chunkIndex,
  episodeHref,
}: ChunkStudyLinkProps) {
  const href = `/podcasts/${podcastSlug}/episodes/${episodeNumber}/chunks/${chunkIndex}/study`;

  return (
    <Link
      href={href}
      onClick={() => {
        if (!episodeHref) {
          return;
        }

        saveTranscriptRestoreState({ episodeHref, chunkId });
      }}
      className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      Study
    </Link>
  );
}
