import { z } from 'zod';
import { getChunkById } from '@/db/chunks';
import { getStudyGuideByChunkId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { apiErr, apiOk } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';

export const maxDuration = 60;

const chunkIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params;
  const parsedParams = chunkIdParamsSchema.safeParse(rawParams);

  if (!parsedParams.success) {
    return apiErr('invalid chunk id', 400);
  }

  const { id: chunkId } = parsedParams.data;

  try {
    const chunk = await getChunkById(chunkId);
    if (!chunk) {
      return apiErr('not found', 404);
    }

    const cachedStudyGuide = await getStudyGuideByChunkId(chunkId);
    if (!cachedStudyGuide) {
      return apiErr('study guide not found', 404);
    }

    return apiOk(parseStudyGuideContent(cachedStudyGuide.content));
  } catch (error: unknown) {
    console.error(`[study-guide] chunk ${chunkId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
