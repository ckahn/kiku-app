import { describe, expect, it } from 'vitest';
import {
  deriveEpisodeStudyStatus,
  deriveEpisodeStudyStatusFromCounts,
  segmentSrsFields,
  type StudyStatus,
} from '@/lib/episodeStudyStatus';

describe('deriveEpisodeStudyStatus', () => {
  it('returns "new" when there are no segments', () => {
    expect(deriveEpisodeStudyStatus([])).toBe('new');
  });

  it('returns "new" when every segment is new', () => {
    expect(deriveEpisodeStudyStatus(['new', 'new', 'new'])).toBe('new');
  });

  it('returns "learned" only when every segment is learned', () => {
    expect(deriveEpisodeStudyStatus(['learned', 'learned'])).toBe('learned');
  });

  it('returns "studying" when any segment is studying', () => {
    expect(deriveEpisodeStudyStatus(['new', 'studying', 'new'])).toBe('studying');
  });

  it('returns "studying" for a mix of learned and new (none studying)', () => {
    expect(deriveEpisodeStudyStatus(['learned', 'new'])).toBe('studying');
  });

  it('returns "studying" for a mix of learned and studying', () => {
    expect(deriveEpisodeStudyStatus(['learned', 'studying'])).toBe('studying');
  });
});

describe('deriveEpisodeStudyStatusFromCounts', () => {
  const cases: ReadonlyArray<{
    label: string;
    counts: { total: number; learned: number; studying: number };
    expected: StudyStatus;
  }> = [
    { label: 'no segments', counts: { total: 0, learned: 0, studying: 0 }, expected: 'new' },
    { label: 'all new', counts: { total: 3, learned: 0, studying: 0 }, expected: 'new' },
    { label: 'all learned', counts: { total: 2, learned: 2, studying: 0 }, expected: 'learned' },
    { label: 'some studying', counts: { total: 3, learned: 0, studying: 1 }, expected: 'studying' },
    { label: 'learned + new', counts: { total: 3, learned: 1, studying: 0 }, expected: 'studying' },
  ];

  it.each(cases)('returns $expected for $label', ({ counts, expected }) => {
    expect(deriveEpisodeStudyStatusFromCounts(counts)).toBe(expected);
  });

  it('agrees with the list-based derivation', () => {
    const statuses: StudyStatus[] = ['learned', 'new', 'studying'];
    const counts = {
      total: statuses.length,
      learned: statuses.filter((s) => s === 'learned').length,
      studying: statuses.filter((s) => s === 'studying').length,
    };
    expect(deriveEpisodeStudyStatusFromCounts(counts)).toBe(
      deriveEpisodeStudyStatus(statuses)
    );
  });
});

describe('segmentSrsFields', () => {
  it('stamps learnedAt when status becomes learned', () => {
    const now = new Date('2026-06-05T00:00:00Z');
    expect(segmentSrsFields('learned', now)).toEqual({
      studyStatus: 'learned',
      learnedAt: now,
    });
  });

  it('clears learnedAt for new and studying', () => {
    expect(segmentSrsFields('new')).toEqual({ studyStatus: 'new', learnedAt: null });
    expect(segmentSrsFields('studying')).toEqual({ studyStatus: 'studying', learnedAt: null });
  });
});
