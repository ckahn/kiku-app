import { eq } from 'drizzle-orm';
import { db } from '.';
import { studyGuides } from './schema';
import type { StudyGuide } from './schema';
import type { StudyGuideContent } from '@/lib/api/types';

export async function getStudyGuideBySegmentId(segmentId: number): Promise<StudyGuide | null> {
  const [studyGuide] = await db
    .select()
    .from(studyGuides)
    .where(eq(studyGuides.segmentId, segmentId));

  return studyGuide ?? null;
}

export async function saveStudyGuideForSegmentId(
  segmentId: number,
  content: StudyGuideContent
): Promise<StudyGuide> {
  const [studyGuide] = await db
    .insert(studyGuides)
    .values({
      segmentId,
      content,
      version: content.version,
    })
    .onConflictDoUpdate({
      target: studyGuides.segmentId,
      set: {
        content,
        version: content.version,
      },
    })
    .returning();

  return studyGuide;
}
