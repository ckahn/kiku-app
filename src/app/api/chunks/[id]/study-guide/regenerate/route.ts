import { z } from 'zod';
import { getChunkById } from '@/db/chunks';
import { generateAndSaveStudyGuide } from '@/lib/api/study-guide-service';
import { apiErr, apiOk } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';

export const maxDuration = 60;

const chunkIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function POST(
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

    return apiOk(await generateAndSaveStudyGuide(chunk));
  } catch (error: unknown) {
    console.error(`[study-guide:regenerate] chunk ${chunkId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
