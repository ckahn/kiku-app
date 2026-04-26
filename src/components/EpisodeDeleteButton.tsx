'use client';

import DeleteButton from '@/components/DeleteButton';

interface EpisodeDeleteButtonProps {
  episodeId: number;
  episodeTitle: string;
  redirectTo?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
}

export default function EpisodeDeleteButton({
  episodeId,
  episodeTitle,
  redirectTo,
  className,
  variant = 'ghost',
  size = 'sm',
  align = 'end',
}: EpisodeDeleteButtonProps) {
  return (
    <DeleteButton
      deleteUrl={`/api/episodes/${episodeId}`}
      confirmMessage={`Delete episode "${episodeTitle}" permanently? This will delete its audio, transcript, and study data.`}
      idleLabel="Delete episode"
      loadingLabel="Deleting…"
      redirectTo={redirectTo}
      variant={variant}
      size={size}
      className={className}
      align={align}
    />
  );
}
