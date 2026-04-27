'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import ActionMenu from '@/components/ActionMenu';
import { DeleteMenuItem } from '@/components/DeleteActionMenu';
import { Button, Input, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/utils';

interface PodcastActionMenuProps {
  podcastId: number;
  podcastName: string;
  podcastDescription?: string | null;
  podcastSlug?: string;
  redirectTo?: string;
  redirectToEditedPodcast?: boolean;
}

interface PodcastUpdateResponse {
  data?: {
    slug: string;
  };
  error?: string;
}

export default function PodcastActionMenu({
  podcastId,
  podcastName,
  podcastDescription = '',
  podcastSlug,
  redirectTo = '/',
  redirectToEditedPodcast = false,
}: PodcastActionMenuProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(podcastName);
  const [description, setDescription] = useState(podcastDescription ?? '');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function openEdit(closeMenu: () => void): void {
    setName(podcastName);
    setDescription(podcastDescription ?? '');
    setNameError(null);
    setFormError(null);
    closeMenu();
    setEditOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNameError(null);
    setFormError(null);

    if (!name.trim()) {
      setNameError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/podcasts/${podcastId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description }),
      });
      const data: PodcastUpdateResponse = await response
        .json()
        .catch(() => ({} as PodcastUpdateResponse));

      if (!response.ok) {
        throw new Error(data.error ?? `Save failed (${response.status})`);
      }

      setEditOpen(false);
      if (
        redirectToEditedPodcast &&
        data.data?.slug &&
        data.data.slug !== podcastSlug
      ) {
        router.push(`/podcasts/${data.data.slug}`);
        return;
      }

      router.refresh();
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ActionMenu ariaLabel={`Actions for ${podcastName}`}>
        {({ closeMenu }) => (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => openEdit(closeMenu)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-canvas-subtle"
            >
              <Pencil size={16} aria-hidden="true" />
              <span>Edit podcast</span>
            </button>
            <DeleteMenuItem
              deleteUrl={`/api/podcasts/${podcastId}`}
              confirmMessage={`Delete podcast "${podcastName}" permanently? This will delete all episodes, audio, transcripts, and study data.`}
              menuLabel="Delete podcast"
              loadingLabel="Deleting..."
              redirectTo={redirectTo}
              closeMenu={closeMenu}
            />
          </>
        )}
      </ActionMenu>
      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit podcast"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Podcast name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError ?? undefined}
            required
          />
          <Input
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          {formError && (
            <p className="text-xs text-error-on-subtle">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
