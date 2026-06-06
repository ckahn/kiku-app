import { notFound } from 'next/navigation';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { attachStudyStatus } from '@/db/episodes';
import EpisodeList from '@/components/EpisodeList';
import AddEpisodeButton from '@/components/AddEpisodeButton';
import { PageShell } from '@/components/layout';
import PodcastActionMenu from '@/components/PodcastActionMenu';

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.slug, slug));
  if (!podcast) notFound();

  const episodeRows = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, podcast.id))
    .orderBy(desc(episodes.createdAt));
  const episodeList = await attachStudyStatus(episodeRows);

  return (
    <PageShell backHref="/" backLabel="Library">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{podcast.name}</h1>
          {podcast.description && (
            <p className="text-muted mt-1">{podcast.description}</p>
          )}
        </div>
        <PodcastActionMenu
          podcastId={podcast.id}
          podcastName={podcast.name}
          podcastDescription={podcast.description}
          podcastSlug={slug}
          redirectToEditedPodcast
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
            Episodes
            {episodeList.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted normal-case tracking-normal">
                {episodeList.length}
              </span>
            )}
          </h2>
          <AddEpisodeButton podcastId={String(podcast.id)} podcastSlug={slug} />
        </div>
        <EpisodeList episodes={episodeList} podcastSlug={slug} />
      </div>
    </PageShell>
  );
}
