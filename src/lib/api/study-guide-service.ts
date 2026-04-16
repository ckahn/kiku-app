import type { Chunk } from '@/db/schema';
import { getChunksByEpisodeId } from '@/db/chunks';
import { saveStudyGuideForChunkId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { normalizeStudyGuideVocabularySurfaces } from '@/lib/api/study-guide-normalization';
import { generateStudyGuideFromProvider } from '@/lib/api/study-guide-provider';
import { STUDY_GUIDE_CONTEXT_CHUNKS } from '@/lib/constants';
import type { StudyGuideContent } from '@/lib/api/types';

export async function generateAndSaveStudyGuide(chunk: Chunk): Promise<StudyGuideContent> {
  const episodeChunks = await getChunksByEpisodeId(chunk.episodeId);
  const contextText = episodeChunks
    .slice(-STUDY_GUIDE_CONTEXT_CHUNKS)
    .map((c) => c.textRaw)
    .join('\n');

  const result = normalizeStudyGuideVocabularySurfaces(
    parseStudyGuideContent(await generateStudyGuideFromProvider(chunk.textRaw, contextText))
  );

  await saveStudyGuideForChunkId(chunk.id, result);
  return result;
}
