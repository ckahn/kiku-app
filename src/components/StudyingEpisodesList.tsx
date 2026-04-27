'use client';

import EpisodeActionMenu from '@/components/EpisodeActionMenu';
import ListItemRow from '@/components/ListItemRow';

interface StudyingEpisode {
  id: number;
  title: string;
  episodeNumber: number;
  podcastSlug: string;
  podcastName: string;
}

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
              <EpisodeActionMenu
                episodeId={ep.id}
                episodeTitle={ep.title}
                episodeNumber={ep.episodeNumber}
                studyStatus="studying"
                redirectTo="/"
              />
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
