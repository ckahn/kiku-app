import { z } from 'zod';
import { getChunkById } from '@/db/chunks';
import { getRawTranscript } from '@/db/episodes';
import { getStudyGuideByChunkId, saveStudyGuideForChunkId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { generateStudyGuideFromProvider } from '@/lib/api/study-guide-provider';
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
    if (cachedStudyGuide) {
      // TODO: If cached content fails validation, consider regenerating once
      // instead of returning a 500 so corrupted rows can self-heal.
      return apiOk(parseStudyGuideContent(cachedStudyGuide.content));
    }

    let transcript;
    try {
      transcript = await getRawTranscript(chunk.episodeId);
    } catch {
      return apiErr('transcript not available for this episode', 404);
    }

    const generatedStudyGuide = parseStudyGuideContent(
      await generateStudyGuideFromProvider(chunk.textRaw, transcript.text)
    );

    await saveStudyGuideForChunkId(chunkId, generatedStudyGuide);

    return apiOk(generatedStudyGuide);
  } catch (error: unknown) {
    console.error(`[study-guide] chunk ${chunkId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
