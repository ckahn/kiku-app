import Link from 'next/link';
import type { Podcast } from '@/db/schema';

export default function PodcastList({ podcasts }: { podcasts: Podcast[] }) {
  if (podcasts.length === 0) {
    return <p className="text-gray-500">No podcasts yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {podcasts.map((p) => (
        <li key={p.id}>
          <Link
            href={`/podcasts/${p.id}`}
            className="block border rounded p-4 hover:bg-gray-50"
          >
            <p className="font-medium">{p.name}</p>
            {p.description && (
              <p className="text-sm text-gray-500">{p.description}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
