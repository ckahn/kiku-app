import { z } from 'zod';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { getErrorMessage } from '@/lib/utils';
import { apiOk, apiErr } from '@/lib/api-response';

// PostgreSQL unique violation error code
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
  );
}

const episodeBodySchema = z.object({
  // blobUrl is the Vercel Blob URL returned after a client upload
  blobUrl: z.string().url('blobUrl must be a valid URL'),
  episodeNumber: z.coerce.number().int().min(1, 'episodeNumber must be a positive integer'),
  title: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const podcastId = Number(id);

    const body: unknown = await request.json();
    const result = episodeBodySchema.safeParse(body);
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }
    const { blobUrl, episodeNumber, title } = result.data;
    const trimmedTitle = title?.trim() || null;

    const [episode] = await db
      .insert(episodes)
      .values({ podcastId, title: trimmedTitle ?? `Episode ${episodeNumber}`, audioUrl: blobUrl, episodeNumber })
      .returning();

    return apiOk(episode, 201);
  } catch (error: unknown) {
    // Unique constraint violation: (podcast_id, episode_number)
    if (isUniqueViolation(error)) {
      return apiErr(`An episode with that number already exists for this podcast`, 409);
    }
    return apiErr(getErrorMessage(error), 500);
  }
}
