import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { deletePrivateBlob } from '@/lib/blob';

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

    for (const episode of episodeRows) {
      try {
        await deletePrivateBlob(episode.audioUrl);
      } catch (error: unknown) {
        console.error(
          `[podcasts.delete] failed to delete blob for podcast ${podcastId}, episode ${episode.id}:`,
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
