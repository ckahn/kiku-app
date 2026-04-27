import type { Episode } from '@/db/schema';
import EpisodeActionMenu from '@/components/EpisodeActionMenu';
import EpisodeStatusBadge from '@/components/EpisodeStatusBadge';
import ListItemRow from '@/components/ListItemRow';

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
                <EpisodeStatusBadge status={ep.status} studyStatus={ep.studyStatus} />
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
