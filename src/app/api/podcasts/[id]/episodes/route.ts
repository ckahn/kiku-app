import { z } from 'zod';
import { put } from '@vercel/blob';
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

export const maxDuration = 60;

const episodeFormSchema = z.object({
  file: z.instanceof(File, { message: 'file is required' }),
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

    const formData = await request.formData();
    const result = episodeFormSchema.safeParse({
      file: formData.get('file'),
      episodeNumber: formData.get('episodeNumber'),
      title: formData.get('title') ?? undefined,
    });
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }
    const { file, episodeNumber, title } = result.data;
    const trimmedTitle = title?.trim() || null;

    const blob = await put(file.name, file, {
      access: 'private',
      contentType: file.type || 'audio/mpeg',
      allowOverwrite: true,
    });

    const [episode] = await db
      .insert(episodes)
      .values({ podcastId, title: trimmedTitle ?? `Episode ${episodeNumber}`, audioUrl: blob.url, episodeNumber })
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
