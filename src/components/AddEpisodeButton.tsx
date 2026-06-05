'use client';
import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import EpisodeUploadForm from '@/components/EpisodeUploadForm';

interface AddEpisodeButtonProps {
  podcastId: string;
  podcastSlug: string;
}

export default function AddEpisodeButton({ podcastId, podcastSlug }: AddEpisodeButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + New episode
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="New episode">
        <EpisodeUploadForm
          podcastId={podcastId}
          podcastSlug={podcastSlug}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
