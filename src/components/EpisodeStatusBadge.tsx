import { Badge } from '@/components/ui';
import { getEpisodeBadge } from '@/lib/episodeBadge';

interface EpisodeStatusBadgeProps {
  status: 'uploaded' | 'transcribing' | 'chunking' | 'ready' | 'error';
  studyStatus: 'new' | 'studying' | 'learned';
  className?: string;
}

export default function EpisodeStatusBadge({ status, studyStatus, className }: EpisodeStatusBadgeProps) {
  const { variant, label } = getEpisodeBadge({ status, studyStatus });
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
