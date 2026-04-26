import Link from 'next/link';
import type { Episode } from '@/db/schema';
import { Badge } from '@/components/ui';
import EpisodeDeleteButton from '@/components/EpisodeDeleteButton';

type BadgeVariant = 'info' | 'warning' | 'success' | 'error' | 'neutral';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  uploaded:     'info',
  transcribing: 'warning',
  chunking:     'warning',
  ready:        'success',
  error:        'error',
};

interface EpisodeListProps {
  episodes: Episode[];
  podcastSlug: string;
}

export default function EpisodeList({ episodes, podcastSlug }: EpisodeListProps) {
  if (episodes.length === 0) {
    return <p className="text-muted text-sm">No episodes yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {episodes.map((ep) => (
        <li key={ep.id}>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <Link
              href={`/podcasts/${podcastSlug}/episodes/${ep.episodeNumber}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:text-ink"
            >
              <div className="min-w-0">
                {ep.episodeNumber && (
                  <p className="text-xs text-muted mb-0.5">Episode {ep.episodeNumber}</p>
                )}
                <p className="font-medium text-ink truncate">{ep.title}</p>
              </div>
              <Badge variant={STATUS_VARIANT[ep.status] ?? 'neutral'}>
                {ep.status}
              </Badge>
            </Link>
            <EpisodeDeleteButton
              episodeId={ep.id}
              episodeTitle={ep.title}
              className="text-error-on-subtle"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
