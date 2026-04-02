import { notFound } from 'next/navigation';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import EpisodeList from '@/components/EpisodeList';
import EpisodeUploadForm from '@/components/EpisodeUploadForm';

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
  if (!podcast) notFound();

  const episodeList = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.createdAt));

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">{podcast.name}</h1>
      {podcast.description && (
        <p className="text-gray-500 mb-6">{podcast.description}</p>
      )}
      <h2 className="text-lg font-semibold mb-2">Upload episode</h2>
      <EpisodeUploadForm podcastId={id} />
      <h2 className="text-lg font-semibold mt-8 mb-2">Episodes</h2>
      <EpisodeList episodes={episodeList} podcastId={id} />
    </main>
  );
}
