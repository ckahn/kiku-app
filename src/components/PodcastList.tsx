import Link from 'next/link';
import type { Podcast } from '@/db/schema';

export default function PodcastList({ podcasts }: { podcasts: Podcast[] }) {
  if (podcasts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-muted text-sm">No podcasts yet.</p>
        <p className="text-muted text-sm mt-1">Add one above to get started.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {podcasts.map((p) => (
        <li key={p.id}>
          <Link
            href={`/podcasts/${p.slug}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-4 hover:bg-canvas transition-colors min-h-[56px]"
          >
            <div className="min-w-0">
              <p className="font-medium text-ink truncate">{p.name}</p>
              {p.description && (
                <p className="text-sm text-muted mt-0.5 truncate">{p.description}</p>
              )}
            </div>
            <span className="text-muted shrink-0">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
