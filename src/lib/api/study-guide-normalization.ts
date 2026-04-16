import type { StudyGuideContent, StudyGuideVocabularyItem } from './types';

const KANJI_RE = /\p{Script=Han}/u;

function hasKanji(value: string): boolean {
  return KANJI_RE.test(value);
}

function normalizeVocabularySurface(
  item: StudyGuideVocabularyItem
): StudyGuideVocabularyItem {
  if (hasKanji(item.japanese) || !hasKanji(item.dictionaryForm)) {
    return item;
  }

  return {
    ...item,
    japanese: item.dictionaryForm,
  };
}

export function normalizeStudyGuideVocabularySurfaces(
  content: StudyGuideContent
): StudyGuideContent {
  return {
    ...content,
    vocabulary: content.vocabulary.map(normalizeVocabularySurface),
  };
}
