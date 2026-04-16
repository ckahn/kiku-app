import { z } from 'zod';
import { getChunkById, getChunksByEpisodeId } from '@/db/chunks';
import { saveStudyGuideForChunkId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { normalizeStudyGuideVocabularySurfaces } from '@/lib/api/study-guide-normalization';
import { generateStudyGuideFromProvider } from '@/lib/api/study-guide-provider';
import { apiErr, apiOk } from '@/lib/api-response';
import { STUDY_GUIDE_CONTEXT_CHUNKS } from '@/lib/constants';
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

    const episodeChunks = await getChunksByEpisodeId(chunk.episodeId);
    // Always take the last N chunks of the episode — see GET handler for the
    // rationale behind this intentional choice.
    const contextText = episodeChunks
      .slice(-STUDY_GUIDE_CONTEXT_CHUNKS)
      .map((candidate) => candidate.textRaw)
      .join('\n');

    const generatedStudyGuide = normalizeStudyGuideVocabularySurfaces(
      parseStudyGuideContent(await generateStudyGuideFromProvider(chunk.textRaw, contextText))
    );

    await saveStudyGuideForChunkId(chunkId, generatedStudyGuide);

    return apiOk(generatedStudyGuide);
  } catch (error: unknown) {
    console.error(`[study-guide:regenerate] chunk ${chunkId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
