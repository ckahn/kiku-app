import { describe, it, expect } from 'vitest';
import studyGuideFixture from '@fixtures/study-guide.json';

describe('study guide parser', () => {
  it('parses the fixture payload', async () => {
    const { parseStudyGuideContent } = await import('../study-guide');

    expect(parseStudyGuideContent(studyGuideFixture)).toEqual(studyGuideFixture);
  });

  it('rejects payloads with the wrong version', async () => {
    const { parseStudyGuideContent } = await import('../study-guide');

    expect(() =>
      parseStudyGuideContent({
        ...studyGuideFixture,
        version: 1,
      })
    ).toThrow(/study guide/i);
  });

  it('rejects payloads with invalid breakdown entries', async () => {
    const { parseStudyGuideContent } = await import('../study-guide');

    expect(() =>
      parseStudyGuideContent({
        ...studyGuideFixture,
        breakdown: [
          {
            id: 'segment-1',
            japanese: '日本語',
            cue: 'Japanese',
          },
        ],
      })
    ).toThrow(/study guide/i);
  });

  it('filters English-only study items and renumbers breakdown order', async () => {
    const { parseStudyGuideContent } = await import('../study-guide');

    const parsed = parseStudyGuideContent({
      ...studyGuideFixture,
      vocabulary: [
        {
          id: 'vocab-english',
          japanese: 'meeting',
          reading: null,
          dictionaryForm: 'meeting',
          meaning: 'meeting',
        },
        studyGuideFixture.vocabulary[0],
      ],
      structures: [
        {
          id: 'structure-english',
          pattern: 'noun',
          reading: null,
          meaning: 'noun',
        },
        studyGuideFixture.structures[0],
      ],
      breakdown: [
        {
          id: 'breakdown-english',
          japanese: 'This is a meeting note.',
          cue: 'English material that should be ignored.',
          order: 0,
        },
        {
          ...studyGuideFixture.breakdown[0],
          order: 7,
        },
      ],
    });

    expect(parsed.vocabulary).toEqual([studyGuideFixture.vocabulary[0]]);
    expect(parsed.structures).toEqual([studyGuideFixture.structures[0]]);
    expect(parsed.breakdown).toEqual([
      {
        ...studyGuideFixture.breakdown[0],
        order: 0,
      },
    ]);
  });

  it('keeps only the dictionary-form vocabulary entry when both forms are present', async () => {
    const { parseStudyGuideContent } = await import('../study-guide');

    const parsed = parseStudyGuideContent({
      ...studyGuideFixture,
      vocabulary: [
        {
          id: 'vocab-tabetari',
          japanese: '食べたり',
          reading: 'たべたり',
          partOfSpeech: 'verb',
          dictionaryForm: '食べる',
          meaning: 'to eat',
        },
        {
          id: 'vocab-taberu',
          japanese: '食べる',
          reading: 'たべる',
          partOfSpeech: 'verb',
          dictionaryForm: '食べる',
          meaning: 'to eat',
        },
      ],
    });

    expect(parsed.vocabulary).toEqual([
      {
        id: 'vocab-taberu',
        japanese: '食べる',
        reading: 'たべる',
        partOfSpeech: 'verb',
        dictionaryForm: '食べる',
        meaning: 'to eat',
      },
    ]);
  });
});
