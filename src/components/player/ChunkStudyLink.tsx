import Link from 'next/link';

interface ChunkStudyLinkProps {
  readonly podcastSlug: string;
  readonly episodeNumber: number;
  readonly chunkIndex: number;
}

export default function ChunkStudyLink({
  podcastSlug,
  episodeNumber,
  chunkIndex,
}: ChunkStudyLinkProps) {
  const href = `/podcasts/${podcastSlug}/episodes/${episodeNumber}/chunks/${chunkIndex}/study`;

  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      Study
    </Link>
  );
}
