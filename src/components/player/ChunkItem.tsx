'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { Chunk } from '@/db/schema';
import type { PlayerControls } from './usePlayer';
import { stripFurigana } from './chunkUtils';
import { saveTranscriptRestoreState } from './studyNavigation';

interface ChunkItemProps {
  readonly chunk: Chunk;
  readonly isActive: boolean;
  readonly controls: PlayerControls;
  readonly podcastSlug?: string;
  readonly episodeNumber?: number;
  readonly episodeHref?: string;
}

export default function ChunkItem({
  chunk,
  isActive,
  controls,
  podcastSlug,
  episodeNumber,
  episodeHref,
}: ChunkItemProps) {
  const displayHtml = stripFurigana(chunk.textFurigana);

  function handleClick() {
    controls.seekToChunk(chunk.id);
  }

  const studyHref =
    podcastSlug && episodeNumber !== undefined
      ? `/podcasts/${podcastSlug}/episodes/${episodeNumber}/segments/${chunk.chunkIndex}/study`
      : null;

  return (
    <li
      data-chunk-id={chunk.id}
      data-active={isActive || undefined}
      onClick={handleClick}
      className={`relative rounded-lg border transition-all p-4 cursor-pointer ${
        isActive
          ? 'border-primary/60 bg-primary-subtle hover:bg-primary/10'
          : 'border-border bg-surface hover:border-primary/30 hover:bg-canvas-subtle'
      }`}
    >
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
              saveTranscriptRestoreState({ episodeHref, chunkId: chunk.id });
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
