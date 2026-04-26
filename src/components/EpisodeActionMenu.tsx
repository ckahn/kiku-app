'use client';

import DeleteActionMenu from '@/components/DeleteActionMenu';

interface EpisodeActionMenuProps {
  episodeId: number;
  episodeTitle: string;
  redirectTo?: string;
}

export default function EpisodeActionMenu({
  episodeId,
  episodeTitle,
  redirectTo,
}: EpisodeActionMenuProps) {
  return (
    <DeleteActionMenu
      ariaLabel={`Actions for ${episodeTitle}`}
      deleteUrl={`/api/episodes/${episodeId}`}
      confirmMessage={`Delete episode "${episodeTitle}" permanently? This will delete its audio, transcript, and study data.`}
      menuLabel="Delete episode"
      loadingLabel="Deleting..."
      redirectTo={redirectTo}
    />
  );
}
