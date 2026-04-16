import { z } from 'zod';
import { getChunkById } from '@/db/chunks';
import { getStudyGuideByChunkId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { normalizeStudyGuideVocabularySurfaces } from '@/lib/api/study-guide-normalization';
import { generateAndSaveStudyGuide } from '@/lib/api/study-guide-service';
import { apiErr, apiOk } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { STUDY_GUIDE_CURRENT_VERSION } from '@/lib/constants';

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
    if (cachedStudyGuide) {
      if (cachedStudyGuide.version === STUDY_GUIDE_CURRENT_VERSION) {
        try {
          return apiOk(
            normalizeStudyGuideVocabularySurfaces(parseStudyGuideContent(cachedStudyGuide.content))
          );
        } catch {
          console.warn(`[study-guide] chunk ${chunkId} cached content failed validation, regenerating`);
        }
      } else {
        console.warn(
          `[study-guide] chunk ${chunkId} has stale version ${cachedStudyGuide.version}, regenerating`
        );
      }
    }

    // We always take the last N chunks of the episode regardless of which chunk
    // is being studied. This guarantees the model has some episode context (for
    // pronoun/topic-drop resolution), without requiring the context window to
    // centre on the studied chunk. For early chunks the context will be from
    // later in the episode — that is intentional; the prompt labels this as
    // "episode context" rather than "preceding context".
    return apiOk(await generateAndSaveStudyGuide(chunk));
  } catch (error: unknown) {
    console.error(`[study-guide] chunk ${chunkId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
