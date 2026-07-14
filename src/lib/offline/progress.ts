import type { DownloadRecord } from './types';

/**
 * Shared progress derivation for download-record UI (the action-menu item
 * and the offline badge) so the percent math and label shape live in one
 * place.
 */

/**
 * Audio download progress as a whole percent (capped at 100), or null when
 * the total is unknown/zero — i.e. the response had no Content-Length and
 * progress is indeterminate.
 */
export function audioDownloadPercent(record: DownloadRecord): number | null {
  if (!record.audioTotalBytes) return null;
  return Math.min(100, Math.round((record.audioBytes / record.audioTotalBytes) * 100));
}

export interface ProgressLabelOptions {
  /** Prefix for the guides-phase label, e.g. "Study guides" or "Guides". */
  readonly guidesPrefix: string;
  /** Label used when audio progress is indeterminate (no Content-Length). */
  readonly audioIndeterminateLabel: string;
}

/**
 * Human-readable progress label for a downloading record:
 * "<guidesPrefix> n/m" during the guides phase, "Audio N%" during the audio
 * phase, or the indeterminate label when the audio total is unknown.
 */
export function downloadProgressLabel(
  record: DownloadRecord,
  options: ProgressLabelOptions
): string {
  if (record.step === 'guides') {
    return `${options.guidesPrefix} ${record.guidesCompleted}/${record.guidesTotal}`;
  }

  const percent = audioDownloadPercent(record);
  return percent === null ? options.audioIndeterminateLabel : `Audio ${percent}%`;
}
