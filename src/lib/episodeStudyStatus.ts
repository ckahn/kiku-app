export type StudyStatus = 'new' | 'studying' | 'learned';

/** Canonical ordering of study statuses, e.g. for dropdown options. */
export const STUDY_STATUS_VALUES: readonly StudyStatus[] = ['new', 'studying', 'learned'];

/** Human-readable labels for each study status. */
export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  new: 'New',
  studying: 'Studying',
  learned: 'Learned',
};

/**
 * Derive an episode's study status from the statuses of its segments.
 *
 * Rules (all-or-nothing edges):
 * - no segments        -> 'new'
 * - every segment new  -> 'new'
 * - every segment learned -> 'learned'
 * - anything in between -> 'studying'
 */
export function deriveEpisodeStudyStatus(
  segmentStatuses: readonly StudyStatus[]
): StudyStatus {
  if (segmentStatuses.length === 0) return 'new';
  if (segmentStatuses.every((status) => status === 'new')) return 'new';
  if (segmentStatuses.every((status) => status === 'learned')) return 'learned';
  return 'studying';
}

/**
 * Derive the episode status from aggregate segment counts. Equivalent to
 * {@link deriveEpisodeStudyStatus} but driven by a GROUP BY count query so
 * callers do not need to materialize every segment status.
 */
export function deriveEpisodeStudyStatusFromCounts(counts: {
  readonly total: number;
  readonly learned: number;
  readonly studying: number;
}): StudyStatus {
  const { total, learned, studying } = counts;
  if (total === 0) return 'new';
  if (learned === total) return 'learned';
  if (studying === 0 && learned === 0) return 'new';
  return 'studying';
}

/**
 * Compute the SRS timestamp fields for a manual segment status change.
 * `learnedAt` is stamped when a segment becomes 'learned' and cleared
 * otherwise. `nextReview` stays null until the review flow is implemented.
 */
export function segmentSrsFields(
  status: StudyStatus,
  now: Date = new Date()
): { studyStatus: StudyStatus; learnedAt: Date | null } {
  return {
    studyStatus: status,
    learnedAt: status === 'learned' ? now : null,
  };
}
