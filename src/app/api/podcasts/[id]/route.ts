import { z } from 'zod';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { and, desc, eq, ne } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { deletePrivateBlob } from '@/lib/blob';
import { toSlug } from '@/lib/slug';

const updatePodcastSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().optional(),
});

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const podcastId = Number(id);

    const body: unknown = await request.json();
    const result = updatePodcastSchema.safeParse(body);
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }

    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, podcastId));
    if (!podcast) return apiErr('not found', 404);

    const name = result.data.name;
    const slug = toSlug(name);
    if (!slug) {
      return apiErr('name must include at least one letter or number', 400);
    }

    const [existing] = await db
      .select()
      .from(podcasts)
      .where(and(eq(podcasts.slug, slug), ne(podcasts.id, podcastId)));
    if (existing) {
      return apiErr(
        `The name "${name}" is too similar to existing podcast "${existing.name}". Please choose a different name.`,
        409
      );
    }

    const description = result.data.description?.trim() || null;
    const [updatedPodcast] = await db
      .update(podcasts)
      .set({ name, slug, description })
      .where(eq(podcasts.id, podcastId))
      .returning();

    return apiOk(updatedPodcast);
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
