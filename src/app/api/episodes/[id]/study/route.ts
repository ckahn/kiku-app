import { z } from 'zod';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { setEpisodeSegmentsStudyStatus } from '@/db/segments';
import { deriveEpisodeStudyStatusFromCounts } from '@/lib/episodeStudyStatus';
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

    // Cascade writes the same status to every segment, so the derived episode
    // status is a pure function of (applied status, segment count). Deriving it
    // from the single UPDATE's own row count avoids a read-after-write whose
    // result a concurrent per-segment edit could otherwise invalidate.
    // The episode-level toggle only applies 'new' or 'studying', never
    // 'learned', so the cascade never produces learned segments.
    const status = result.data.studyStatus;
    const updatedCount = await setEpisodeSegmentsStudyStatus(episodeId, status);
    const studyStatus = deriveEpisodeStudyStatusFromCounts({
      total: updatedCount,
      learned: 0,
      studying: status === 'studying' ? updatedCount : 0,
    });

    return apiOk({ id: episodeId, studyStatus });
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
