'use client';

import type { Chunk } from '@/db/schema';
import type { PlayerControls } from './usePlayer';
import { stripFurigana } from './chunkUtils';

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

  return (
    <li
      data-chunk-id={chunk.id}
      data-active={isActive || undefined}
      onClick={handleClick}
      className={`rounded-lg border transition-all p-4 cursor-pointer ${
        isActive
          ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-surface hover:border-primary/30 hover:bg-canvas-subtle'
      }`}
    >
      <p
        className="text-sm text-ink font-jp leading-loose"
        // textFurigana is Claude-generated HTML containing only <ruby>/<rt> tags.
        // It is not user-supplied input.
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
    </li>
  );
}
