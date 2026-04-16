import { z } from 'zod';
import type {
  StudyGuideBreakdownSegment,
  StudyGuideContent,
  StudyGuideStructureItem,
  StudyGuideVocabularyItem,
} from './types';

const studyGuideVocabularyItemSchema = z.object({
  id: z.string().min(1),
  japanese: z.string().min(1),
  reading: z.string().min(1).nullable(),
  dictionaryForm: z.string().min(1),
  meaning: z.string().min(1),
}) satisfies z.ZodType<StudyGuideVocabularyItem>;

const studyGuideStructureItemSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  reading: z.string().min(1).nullable(),
  meaning: z.string().min(1),
  note: z.string().min(1).optional(),
}) satisfies z.ZodType<StudyGuideStructureItem>;

const studyGuideBreakdownSegmentSchema = z.object({
  id: z.string().min(1),
  japanese: z.string().min(1),
  cue: z.string().min(1),
  order: z.number().int().nonnegative(),
}) satisfies z.ZodType<StudyGuideBreakdownSegment>;

export const studyGuideContentSchema = z.object({
  version: z.literal(2),
  vocabulary: z.array(studyGuideVocabularyItemSchema),
  structures: z.array(studyGuideStructureItemSchema),
  breakdown: z.array(studyGuideBreakdownSegmentSchema),
  translation: z.object({
    fullEnglish: z.string().min(1),
  }),
}) satisfies z.ZodType<StudyGuideContent>;

export function parseStudyGuideContent(content: unknown): StudyGuideContent {
  const result = studyGuideContentSchema.safeParse(content);

  if (!result.success) {
    throw new Error(`Invalid study guide content: ${result.error.issues[0]?.message ?? 'Unknown error'}`);
  }

  return result.data;
}
