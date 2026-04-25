import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { PageShell } from '@/components/layout';
import StudyScreen from '@/components/study/StudyScreen';
import { db } from '@/db';
import { getChunkByEpisodeIdAndIndex, getChunksByEpisodeId } from '@/db/chunks';
import { episodes, podcasts } from '@/db/schema';

interface StudyPageParams {
  readonly slug: string;
  readonly number: string;
  readonly segmentIndex: string;
}

export default async function StudyPage({
  params,
}: {
  params: Promise<StudyPageParams>;
}) {
  const { slug, number, segmentIndex } = await params;
  const parsedEpisodeNumber = Number(number);
  const parsedSegmentIndex = Number(segmentIndex);

  if (
    !Number.isInteger(parsedEpisodeNumber) ||
    parsedEpisodeNumber < 1 ||
    !Number.isInteger(parsedSegmentIndex) ||
    parsedSegmentIndex < 0
  ) {
    notFound();
  }

  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.slug, slug));
  if (!podcast) {
    notFound();
  }

  const [episode] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.podcastId, podcast.id), eq(episodes.episodeNumber, parsedEpisodeNumber)));
  if (!episode) {
    notFound();
  }

  const [chunk, allChunks] = await Promise.all([
    getChunkByEpisodeIdAndIndex(episode.id, parsedSegmentIndex),
    getChunksByEpisodeId(episode.id),
  ]);
  if (!chunk) {
    notFound();
  }

  const segmentBase = `/podcasts/${slug}/episodes/${episode.episodeNumber}/segments`;
  const prevHref = parsedSegmentIndex > 0 ? `${segmentBase}/${parsedSegmentIndex - 1}/study` : undefined;
  const nextHref = parsedSegmentIndex < allChunks.length - 1 ? `${segmentBase}/${parsedSegmentIndex + 1}/study` : undefined;

  return (
    <PageShell>
      <StudyScreen
        chunk={chunk}
        totalSegments={allChunks.length}
        audioUrl={`/api/episodes/${episode.id}/audio`}
        studyGuideUrl={`/api/segments/${chunk.id}/study-guide`}
        backHref={`/podcasts/${slug}/episodes/${episode.episodeNumber}`}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </PageShell>
  );
}
