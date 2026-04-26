import Link from 'next/link';
import type { Podcast } from '@/db/schema';
import PodcastActionMenu from '@/components/PodcastActionMenu';

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
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-4 min-h-[56px] transition-colors hover:bg-canvas">
            <Link
              href={`/podcasts/${p.slug}`}
              className="min-w-0 flex-1"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{p.name}</p>
                {p.description && (
                  <p className="text-sm text-muted mt-0.5 truncate">{p.description}</p>
                )}
              </div>
            </Link>
            <PodcastActionMenu
              podcastId={p.id}
              podcastName={p.name}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
