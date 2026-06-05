import { Circle, CircleDot, CircleCheck, type LucideIcon } from 'lucide-react';
import { STUDY_STATUS_LABELS, type StudyStatus } from '@/lib/episodeStudyStatus';

const STATUS_ICON: Record<StudyStatus, { icon: LucideIcon; className: string }> = {
  new: { icon: Circle, className: 'text-muted' },
  studying: { icon: CircleDot, className: 'text-primary' },
  learned: { icon: CircleCheck, className: 'text-success' },
};

interface SegmentStatusIconProps {
  readonly status: StudyStatus;
  readonly size?: number;
  readonly className?: string;
}

/**
 * Small non-interactive indicator showing a segment's study status.
 */
export default function SegmentStatusIcon({
  status,
  size = 16,
  className,
}: SegmentStatusIconProps) {
  const { icon: Icon, className: colorClass } = STATUS_ICON[status];
  return (
    <Icon
      size={size}
      className={className ? `${colorClass} ${className}` : colorClass}
      aria-label={STUDY_STATUS_LABELS[status]}
      role="img"
    />
  );
}
