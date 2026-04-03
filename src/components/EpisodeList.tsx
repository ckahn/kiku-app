import Link from 'next/link';
import type { Episode } from '@/db/schema';

const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-blue-100 text-blue-800',
  transcribing: 'bg-yellow-100 text-yellow-800',
  chunking:     'bg-yellow-100 text-yellow-800',
  ready:        'bg-green-100 text-green-800',
  error:        'bg-red-100 text-red-800',
};

export default function EpisodeList({
  episodes,
  podcastSlug,
}: {
  episodes: Episode[];
  podcastSlug: string;
}) {
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
