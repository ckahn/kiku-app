import type { Chunk } from '@/db/schema';

interface ChunkListProps {
  readonly chunks: readonly Chunk[];
}

export default function ChunkList({ chunks }: ChunkListProps) {
  return (
    <ol className="space-y-4">
      {chunks.map((chunk) => (
        <li key={chunk.id} className="rounded-lg border border-border bg-surface p-4">
          <p
            className="text-sm text-ink font-jp leading-loose"
            // textFurigana is Claude-generated HTML containing only <ruby>/<rt> tags.
            // It is not user-supplied input.
            dangerouslySetInnerHTML={{ __html: chunk.textFurigana }}
          />
        </li>
      ))}
    </ol>
  );
}
