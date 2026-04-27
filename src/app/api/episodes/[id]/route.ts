import { z } from 'zod';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { deletePrivateBlob } from '@/lib/blob';

const updateEpisodeSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  episodeNumber: z.coerce.number().int().min(1, 'episodeNumber must be a positive integer'),
});

async function isAudioUrlUsedByAnotherEpisode(
  audioUrl: string,
  episodeId: number
): Promise<boolean> {
  const [referencingEpisode] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.audioUrl, audioUrl), ne(episodes.id, episodeId)))
    .limit(1);

  return referencingEpisode !== undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, Number(id)));
  if (!episode) return apiErr('not found', 404);
  return apiOk(episode);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const episodeId = Number(id);
    if (!Number.isInteger(episodeId) || episodeId < 1) return apiErr('invalid id', 400);

    const body: unknown = await request.json();
    const result = updateEpisodeSchema.safeParse(body);
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode) return apiErr('not found', 404);

    const { title, episodeNumber } = result.data;
    const [existingEpisode] = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          eq(episodes.podcastId, episode.podcastId),
          eq(episodes.episodeNumber, episodeNumber),
          ne(episodes.id, episodeId)
        )
      )
      .limit(1);
    if (existingEpisode) {
      return apiErr('An episode with that number already exists for this podcast', 409);
    }

    const [updatedEpisode] = await db
      .update(episodes)
      .set({ title, episodeNumber, updatedAt: new Date() })
      .where(eq(episodes.id, episodeId))
      .returning();

    return apiOk(updatedEpisode);
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const episodeId = Number(id);

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode) return apiErr('not found', 404);

    const audioUrlInUse = await isAudioUrlUsedByAnotherEpisode(episode.audioUrl, episodeId);
    if (!audioUrlInUse) {
      try {
        await deletePrivateBlob(episode.audioUrl);
      } catch (error: unknown) {
        console.error(`[episodes.delete] failed to delete blob for episode ${episodeId}:`, error);
        return apiErr(getErrorMessage(error), 500);
      }
    }

    await db.delete(episodes).where(eq(episodes.id, episodeId));
    return apiOk({ deleted: true });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
