import { z } from 'zod';
import type {
  StudyGuideBreakdownSegment,
  StudyGuideContent,
  StudyGuideStructureItem,
  StudyGuideVocabularyItem,
} from './types';

const JAPANESE_SCRIPT_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}々ー]/gu;
const LATIN_LETTER_RE = /[A-Za-z]/gu;

const studyGuideVocabularyItemSchema = z.object({
  id: z.string().min(1),
  japanese: z.string().min(1),
  reading: z.string().min(1).nullable(),
  partOfSpeech: z.string().min(1).optional(),
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

function isJapaneseStudyText(value: string): boolean {
  const text = value.trim();
  if (text.length === 0) {
    return false;
  }

  const japaneseCount = text.match(JAPANESE_SCRIPT_RE)?.length ?? 0;
  if (japaneseCount === 0) {
    return false;
  }

  const latinCount = text.match(LATIN_LETTER_RE)?.length ?? 0;
  return japaneseCount >= latinCount;
}

function dedupeVocabularyItems(
  vocabulary: readonly StudyGuideVocabularyItem[]
): StudyGuideVocabularyItem[] {
  const deduped = new Map<string, StudyGuideVocabularyItem>();

  for (const item of vocabulary) {
    const key = item.dictionaryForm.trim();
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, item);
      continue;
    }

    const currentIsDictionaryForm = item.japanese === item.dictionaryForm;
    const existingIsDictionaryForm = existing.japanese === existing.dictionaryForm;

    if (currentIsDictionaryForm && !existingIsDictionaryForm) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()];
}

function sanitizeStudyGuideContent(content: StudyGuideContent): StudyGuideContent {
  const vocabulary = dedupeVocabularyItems(
    content.vocabulary.filter(
      (item) => isJapaneseStudyText(item.japanese) && isJapaneseStudyText(item.dictionaryForm)
    )
  );

  const structures = content.structures.filter((item) => isJapaneseStudyText(item.pattern));

  const breakdown = content.breakdown
    .filter((segment) => isJapaneseStudyText(segment.japanese))
    .map((segment, order) => ({
      ...segment,
      order,
    }));

  return {
    ...content,
    vocabulary,
    structures,
    breakdown,
  };
}

export function parseStudyGuideContent(content: unknown): StudyGuideContent {
  const result = studyGuideContentSchema.safeParse(content);

  if (!result.success) {
    throw new Error(`Invalid study guide content: ${result.error.issues[0]?.message ?? 'Unknown error'}`);
  }

  return sanitizeStudyGuideContent(result.data);
}
