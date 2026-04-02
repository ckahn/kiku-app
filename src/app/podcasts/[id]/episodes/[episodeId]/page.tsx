import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-blue-100 text-blue-800',
  transcribing: 'bg-yellow-100 text-yellow-800',
  chunking:     'bg-yellow-100 text-yellow-800',
  ready:        'bg-green-100 text-green-800',
  error:        'bg-red-100 text-red-800',
};

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; episodeId: string }>;
}) {
  const { id: podcastId, episodeId } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!episode) notFound();

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href={`/podcasts/${podcastId}`} className="text-sm text-blue-600 hover:underline mb-4 block">
        ← Back
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{episode.title}</h1>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[episode.status]}`}>
          {episode.status}
        </span>
      </div>
      <dl className="space-y-3 text-sm">
        {episode.durationMs && (
          <>
            <dt className="text-gray-500">Duration</dt>
            <dd>{Math.round(episode.durationMs / 1000)}s</dd>
          </>
        )}
        <dt className="text-gray-500">Audio</dt>
        <dd>
          <a href={episode.audioUrl} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
            Open audio
          </a>
        </dd>
        <dt className="text-gray-500">Created</dt>
        <dd>{episode.createdAt?.toLocaleString()}</dd>
      </dl>
    </main>
  );
}
