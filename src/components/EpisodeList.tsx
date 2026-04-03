import Link from 'next/link';
import type { Episode } from '@/db/schema';
import { STATUS_COLORS } from '@/lib/constants';

interface EpisodeListProps {
  episodes: Episode[];
  podcastSlug: string;
}

export default function EpisodeList({ episodes, podcastSlug }: EpisodeListProps) {
  if (episodes.length === 0) {
    return <p className="text-gray-500">No episodes yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {episodes.map((ep) => (
        <li key={ep.id}>
          <Link
            href={`/podcasts/${podcastSlug}/episodes/${ep.episodeNumber}`}
            className="block border rounded p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{ep.title}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[ep.status]}`}
              >
                {ep.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
