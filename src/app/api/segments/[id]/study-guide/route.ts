import { z } from 'zod';
import { getSegmentById } from '@/db/segments';
import { getStudyGuideBySegmentId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { normalizeStudyGuideVocabularySurfaces } from '@/lib/api/study-guide-normalization';
import { generateAndSaveStudyGuide } from '@/lib/api/study-guide-service';
import { apiErr, apiOk } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { STUDY_GUIDE_CURRENT_VERSION } from '@/lib/constants';

export const maxDuration = 60;

const segmentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function GET(
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

    const cachedStudyGuide = await getStudyGuideBySegmentId(segmentId);
    if (cachedStudyGuide) {
      if (cachedStudyGuide.version === STUDY_GUIDE_CURRENT_VERSION) {
        try {
          return apiOk(
            normalizeStudyGuideVocabularySurfaces(parseStudyGuideContent(cachedStudyGuide.content))
          );
        } catch {
          console.warn(`[study-guide] segment ${segmentId} cached content failed validation, regenerating`);
        }
      } else {
        console.warn(
          `[study-guide] segment ${segmentId} has stale version ${cachedStudyGuide.version}, regenerating`
        );
      }
    }

    // We always take the last N segments of the episode regardless of which segment
    // is being studied. This guarantees the model has some episode context (for
    // pronoun/topic-drop resolution), without requiring the context window to
    // centre on the studied segment. For early segments the context will be from
    // later in the episode — that is intentional; the prompt labels this as
    // "episode context" rather than "preceding context".
    return apiOk(await generateAndSaveStudyGuide(segment));
  } catch (error: unknown) {
    console.error(`[study-guide] segment ${segmentId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
