import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { and, desc, eq, ne } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { deletePrivateBlob } from '@/lib/blob';

async function isAudioUrlUsedOutsidePodcast(
  audioUrl: string,
  podcastId: number
): Promise<boolean> {
  const [referencingEpisode] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.audioUrl, audioUrl), ne(episodes.podcastId, podcastId)))
    .limit(1);

  return referencingEpisode !== undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, Number(id)));
  if (!podcast) return apiErr('not found', 404);

  const episodeRows = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, Number(id)))
    .orderBy(desc(episodes.createdAt));

  return apiOk({ ...podcast, episodes: episodeRows });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const podcastId = Number(id);

    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, podcastId));
    if (!podcast) return apiErr('not found', 404);

    const episodeRows = await db
      .select()
      .from(episodes)
      .where(eq(episodes.podcastId, podcastId))
      .orderBy(desc(episodes.createdAt));

    const audioUrls = [...new Set(episodeRows.map((episode) => episode.audioUrl))];

    // TODO: Batch-delete blob URLs when podcast libraries get large.
    for (const audioUrl of audioUrls) {
      const audioUrlInUse = await isAudioUrlUsedOutsidePodcast(audioUrl, podcastId);
      if (audioUrlInUse) continue;

      try {
        await deletePrivateBlob(audioUrl);
      } catch (error: unknown) {
        console.error(
          `[podcasts.delete] failed to delete blob ${audioUrl} for podcast ${podcastId}:`,
          error
        );
        return apiErr(getErrorMessage(error), 500);
      }
    }

    await db.delete(podcasts).where(eq(podcasts.id, podcastId));
    return apiOk({ deleted: true });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
