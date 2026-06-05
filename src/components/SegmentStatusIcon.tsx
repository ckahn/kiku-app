import { Check } from 'lucide-react';
import { STUDY_STATUS_LABELS, type StudyStatus } from '@/lib/episodeStudyStatus';

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
        className={`inline-block h-2.5 w-2.5 rounded-full bg-warning-on-subtle${className ? ` ${className}` : ''}`}
      />
    );
  }

  return (
    <Check
      size={size}
      role="img"
      aria-label={label}
      className={`text-success-on-subtle${className ? ` ${className}` : ''}`}
    />
  );
}
