import type { Episode } from '@/db/schema';
import { Badge } from '@/components/ui';
import EpisodeActionMenu from '@/components/EpisodeActionMenu';
import ListItemRow from '@/components/ListItemRow';

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
          <ListItemRow
            href={`/podcasts/${podcastSlug}/episodes/${ep.episodeNumber}`}
            actions={(
              <>
                <Badge variant={STATUS_VARIANT[ep.status] ?? 'neutral'}>
                  {ep.status}
                </Badge>
                <EpisodeActionMenu
                  episodeId={ep.id}
                  episodeTitle={ep.title}
                  episodeNumber={ep.episodeNumber}
                  studyStatus={ep.studyStatus}
                />
              </>
            )}
          >
            {ep.episodeNumber && (
              <p className="text-xs text-muted mb-0.5">Episode {ep.episodeNumber}</p>
            )}
            <p className="font-medium text-ink truncate">{ep.title}</p>
          </ListItemRow>
        </li>
      ))}
    </ul>
  );
}
