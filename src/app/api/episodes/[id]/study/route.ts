import { z } from 'zod';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { setEpisodeSegmentsStudyStatus } from '@/db/segments';
import { getEpisodeStudyStatusMap } from '@/db/episodes';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';

// The episode-level toggle only moves between new and studying; 'learned' is
// reached per-segment. The chosen status cascades to ALL segments, overwriting
// any that were individually marked 'learned'.
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
    if (!Number.isInteger(episodeId) || episodeId < 1) return apiErr('invalid id', 400);

    const body: unknown = await request.json();
    const result = updateStudyStatusSchema.safeParse(body);
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode) return apiErr('not found', 404);

    await setEpisodeSegmentsStudyStatus(episodeId, result.data.studyStatus);
    const statusMap = await getEpisodeStudyStatusMap([episodeId]);

    return apiOk({ id: episodeId, studyStatus: statusMap.get(episodeId) ?? 'new' });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
