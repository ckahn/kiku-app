import { z } from 'zod';
import { updateSegmentStudyStatus } from '@/db/segments';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';

const updateStudyStatusSchema = z.object({
  studyStatus: z.enum(['new', 'studying', 'learned']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const segmentId = Number(id);
    if (!Number.isInteger(segmentId) || segmentId < 1) return apiErr('invalid id', 400);

    const body: unknown = await request.json();
    const result = updateStudyStatusSchema.safeParse(body);
    if (!result.success) {
      return apiErr(result.error.issues[0].message, 400);
    }

    const updated = await updateSegmentStudyStatus(segmentId, result.data.studyStatus);
    if (!updated) return apiErr('not found', 404);

    return apiOk(updated);
  } catch (error: unknown) {
    return apiErr(getErrorMessage(error), 500);
  }
}
