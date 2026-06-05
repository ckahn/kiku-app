import type { Segment } from '@/db/schema';
import { getSegmentsByEpisodeId } from '@/db/segments';
import { saveStudyGuideForSegmentId } from '@/db/study-guides';
import { parseStudyGuideContent } from '@/lib/api/study-guide';
import { normalizeStudyGuideVocabularySurfaces } from '@/lib/api/study-guide-normalization';
import { generateStudyGuideFromProvider } from '@/lib/api/study-guide-provider';
import { STUDY_GUIDE_CONTEXT_SEGMENTS } from '@/lib/constants';
import type { StudyGuideContent } from '@/lib/api/types';

export async function buildStudyGuideContext(episodeId: number): Promise<string> {
  const episodeSegments = await getSegmentsByEpisodeId(episodeId);
  return episodeSegments
    .slice(-STUDY_GUIDE_CONTEXT_SEGMENTS)
    .map((c) => c.textRaw)
    .join('\n');
}

export async function generateAndSaveStudyGuide(segment: Segment): Promise<StudyGuideContent> {
  const contextText = await buildStudyGuideContext(segment.episodeId);

  const result = normalizeStudyGuideVocabularySurfaces(
    parseStudyGuideContent(await generateStudyGuideFromProvider(segment.textRaw, contextText))
  );

  await saveStudyGuideForSegmentId(segment.id, result);
  return result;
}
