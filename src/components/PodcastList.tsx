import type { Podcast } from '@/db/schema';
import PodcastActionMenu from '@/components/PodcastActionMenu';
import ListItemRow from '@/components/ListItemRow';

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
          <ListItemRow
            href={`/podcasts/${p.slug}`}
            actions={(
              <PodcastActionMenu
                podcastId={p.id}
                podcastName={p.name}
                podcastDescription={p.description}
              />
            )}
          >
            <p className="font-medium text-ink truncate">{p.name}</p>
            {p.description && (
              <p className="text-sm text-muted mt-0.5 truncate">{p.description}</p>
            )}
          </ListItemRow>
        </li>
      ))}
    </ul>
  );
}
