'use client';
import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import PodcastCreateForm from '@/components/PodcastCreateForm';

export default function AddPodcastButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + New podcast
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="New podcast">
        <PodcastCreateForm onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
