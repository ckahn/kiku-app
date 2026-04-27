'use client';

import type { Episode } from '@/db/schema';
import EpisodeActionMenu from '@/components/EpisodeActionMenu';
import EpisodeStatusBadge from '@/components/EpisodeStatusBadge';
import ListItemRow from '@/components/ListItemRow';

type StudyingEpisode = Pick<Episode, 'id' | 'title' | 'episodeNumber' | 'status' | 'studyStatus'> & {
  podcastSlug: string;
  podcastName: string;
};

interface StudyingEpisodesListProps {
  episodes: StudyingEpisode[];
}

export default function StudyingEpisodesList({ episodes }: StudyingEpisodesListProps) {
  return (
    <ul className="space-y-2">
      {episodes.map((ep) => (
        <li key={ep.id}>
          <ListItemRow
            href={`/podcasts/${ep.podcastSlug}/episodes/${ep.episodeNumber}`}
            actions={(
              <>
                <EpisodeStatusBadge status={ep.status} studyStatus={ep.studyStatus} />
                <EpisodeActionMenu
                  episodeId={ep.id}
                  episodeTitle={ep.title}
                  episodeNumber={ep.episodeNumber}
                  studyStatus={ep.studyStatus}
                  redirectTo="/"
                />
              </>
            )}
          >
            <p className="font-medium text-ink truncate">{ep.title}</p>
            <p className="text-xs text-muted mt-0.5">{ep.podcastName} · Episode {ep.episodeNumber}</p>
          </ListItemRow>
        </li>
      ))}
    </ul>
  );
}
