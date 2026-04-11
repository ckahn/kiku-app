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
});
