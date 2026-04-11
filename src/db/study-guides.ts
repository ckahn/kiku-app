import { eq } from 'drizzle-orm';
import { db } from '.';
import { studyGuides } from './schema';
import type { StudyGuide } from './schema';
import type { StudyGuideContent } from '@/lib/api/types';

export async function getStudyGuideByChunkId(chunkId: number): Promise<StudyGuide | null> {
  const [studyGuide] = await db
    .select()
    .from(studyGuides)
    .where(eq(studyGuides.chunkId, chunkId));

  return studyGuide ?? null;
}

export async function saveStudyGuideForChunkId(
  chunkId: number,
  content: StudyGuideContent
): Promise<StudyGuide> {
  const [studyGuide] = await db
    .insert(studyGuides)
    .values({
      chunkId,
      content,
      version: content.version,
    })
    .onConflictDoUpdate({
      target: studyGuides.chunkId,
      set: {
        content,
        version: content.version,
      },
    })
    .returning();

  return studyGuide;
}
