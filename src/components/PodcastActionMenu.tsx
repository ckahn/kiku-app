'use client';

import DeleteActionMenu from '@/components/DeleteActionMenu';

interface PodcastActionMenuProps {
  podcastId: number;
  podcastName: string;
  redirectTo?: string;
}

export default function PodcastActionMenu({
  podcastId,
  podcastName,
  redirectTo = '/',
}: PodcastActionMenuProps) {
  return (
    <DeleteActionMenu
      ariaLabel={`Actions for ${podcastName}`}
      deleteUrl={`/api/podcasts/${podcastId}`}
      confirmMessage={`Delete podcast "${podcastName}" permanently? This will delete all episodes, audio, transcripts, and study data.`}
      menuLabel="Delete podcast"
      loadingLabel="Deleting..."
      redirectTo={redirectTo}
    />
  );
}
