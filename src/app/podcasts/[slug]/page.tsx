import { notFound } from 'next/navigation';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import EpisodeList from '@/components/EpisodeList';
import EpisodeUploadForm from '@/components/EpisodeUploadForm';
import { PageShell } from '@/components/layout';

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.slug, slug));
  if (!podcast) notFound();

  const episodeList = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, podcast.id))
    .orderBy(desc(episodes.createdAt));

  return (
    <PageShell backHref="/" backLabel="All podcasts">
      <h1 className="text-2xl font-bold text-ink mb-1">{podcast.name}</h1>
      {podcast.description && (
        <p className="text-muted mb-6">{podcast.description}</p>
      )}
      <h2 className="text-base font-semibold text-ink mb-3">Upload episode</h2>
      <EpisodeUploadForm podcastId={String(podcast.id)} />
      <h2 className="text-base font-semibold text-ink mt-8 mb-3">Episodes</h2>
      <EpisodeList episodes={episodeList} podcastSlug={slug} />
    </PageShell>
  );
}
