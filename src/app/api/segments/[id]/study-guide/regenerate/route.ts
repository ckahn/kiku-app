import { z } from 'zod';
import { getSegmentById } from '@/db/segments';
import { generateAndSaveStudyGuide } from '@/lib/api/study-guide-service';
import { apiErr, apiOk } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';

export const maxDuration = 60;

const segmentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params;
  const parsedParams = segmentIdParamsSchema.safeParse(rawParams);

  if (!parsedParams.success) {
    return apiErr('invalid segment id', 400);
  }

  const { id: segmentId } = parsedParams.data;

  try {
    const segment = await getSegmentById(segmentId);
    if (!segment) {
      return apiErr('not found', 404);
    }

    return apiOk(await generateAndSaveStudyGuide(segment));
  } catch (error: unknown) {
    console.error(`[study-guide:regenerate] segment ${segmentId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
