'use client';

import DeleteButton from '@/components/DeleteButton';

interface PodcastDeleteButtonProps {
  podcastId: number;
  podcastName: string;
  redirectTo?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
}

export default function PodcastDeleteButton({
  podcastId,
  podcastName,
  redirectTo = '/',
  className,
  variant = 'ghost',
  size = 'sm',
  align = 'end',
}: PodcastDeleteButtonProps) {
  return (
    <DeleteButton
      deleteUrl={`/api/podcasts/${podcastId}`}
      confirmMessage={`Delete podcast "${podcastName}" permanently? This will delete all episodes, audio, transcripts, and study data.`}
      idleLabel="Delete podcast"
      loadingLabel="Deleting…"
      redirectTo={redirectTo}
      variant={variant}
      size={size}
      className={className}
      align={align}
    />
  );
}
