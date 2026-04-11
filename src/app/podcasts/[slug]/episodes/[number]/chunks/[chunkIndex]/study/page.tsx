import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { PageShell } from '@/components/layout';
import StudyScreen from '@/components/study/StudyScreen';
import { db } from '@/db';
import { getChunkByEpisodeIdAndIndex } from '@/db/chunks';
import { episodes, podcasts } from '@/db/schema';

interface StudyPageParams {
  readonly slug: string;
  readonly number: string;
  readonly chunkIndex: string;
}

export default async function StudyPage({
  params,
}: {
  params: Promise<StudyPageParams>;
}) {
  const { slug, number, chunkIndex } = await params;
  const parsedEpisodeNumber = Number(number);
  const parsedChunkIndex = Number(chunkIndex);

  if (!Number.isInteger(parsedEpisodeNumber) || !Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0) {
    notFound();
  }

  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.slug, slug));
  if (!podcast) {
    notFound();
  }

  const [episode] = await db
    .select()
    .from(episodes)
    .where(and(
      eq(episodes.podcastId, podcast.id),
      eq(episodes.episodeNumber, parsedEpisodeNumber)
    ));
  if (!episode) {
    notFound();
  }

  const chunk = await getChunkByEpisodeIdAndIndex(episode.id, parsedChunkIndex);
  if (!chunk) {
    notFound();
  }

  return (
    <PageShell backHref={`/podcasts/${slug}/episodes/${episode.episodeNumber}`} backLabel="Transcript">
      <StudyScreen
        chunk={chunk}
        audioUrl={`/api/episodes/${episode.id}/audio`}
        studyGuideUrl={`/api/chunks/${chunk.id}/study-guide`}
      />
    </PageShell>
  );
}
