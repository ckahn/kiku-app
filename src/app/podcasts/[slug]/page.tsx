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
    <PageShell backHref="/" backLabel="Library">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">{podcast.name}</h1>
        {podcast.description && (
          <p className="text-muted mt-1">{podcast.description}</p>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">
          Upload episode
        </h2>
        <div className="rounded-lg border border-border bg-surface p-4">
          <EpisodeUploadForm podcastId={String(podcast.id)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">
          Episodes
          {episodeList.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted normal-case tracking-normal">
              {episodeList.length}
            </span>
          )}
        </h2>
        <EpisodeList episodes={episodeList} podcastSlug={slug} />
      </div>
    </PageShell>
  );
}
