import { Check } from 'lucide-react';
import { STUDY_STATUS_LABELS, type StudyStatus } from '@/lib/episodeStudyStatus';

// Full, static class strings so Tailwind's scanner detects them. Do not build
// these by gluing a utility directly onto a `${...}` interpolation — that hides
// the class from the scanner and the style is silently dropped.
const DOT_CLASS = 'inline-block h-2.5 w-2.5 rounded-full bg-warning-on-subtle';
const CHECK_CLASS = 'text-success-on-subtle';

interface SegmentStatusIconProps {
  readonly status: StudyStatus;
  readonly size?: number;
  readonly className?: string;
}

/**
 * Small non-interactive indicator for a segment's study status.
 * - new:      no glyph (the common default — avoids list noise)
 * - studying: filled amber dot
 * - learned:  bare green checkmark
 */
export default function SegmentStatusIcon({
  status,
  size = 16,
  className,
}: SegmentStatusIconProps) {
  if (status === 'new') return null;

  const label = STUDY_STATUS_LABELS[status];

  if (status === 'studying') {
    return (
      <span
        role="img"
        aria-label={label}
        className={className ? `${DOT_CLASS} ${className}` : DOT_CLASS}
      />
    );
  }

  return (
    <Check
      size={size}
      role="img"
      aria-label={label}
      className={className ? `${CHECK_CLASS} ${className}` : CHECK_CLASS}
    />
  );
}
