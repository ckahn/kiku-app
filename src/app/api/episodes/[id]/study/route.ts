import { z } from 'zod';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';

const updateStudyStatusSchema = z.object({
  studyStatus: z.enum(['new', 'studying']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const episodeId = Number(id);

    const body: unknown = await request.json();
    const result = updateStudyStatusSchema.safeParse(body);
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode) return apiErr('not found', 404);

    const [updatedEpisode] = await db
      .update(episodes)
      .set({ studyStatus: result.data.studyStatus, updatedAt: new Date() })
      .where(eq(episodes.id, episodeId))
      .returning();

    return apiOk(updatedEpisode);
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
