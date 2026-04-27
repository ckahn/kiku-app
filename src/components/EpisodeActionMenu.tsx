'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, BookOpenCheck, Pencil } from 'lucide-react';
import ActionMenu from '@/components/ActionMenu';
import { DeleteMenuItem } from '@/components/DeleteActionMenu';
import { Button, Input, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/utils';

interface EpisodeActionMenuProps {
  episodeId: number;
  episodeTitle: string;
  episodeNumber: number;
  studyStatus?: 'new' | 'studying' | 'learned';
  redirectTo?: string;
  podcastSlug?: string;
  redirectToEditedEpisode?: boolean;
}

interface EpisodeUpdateResponse {
  data?: {
    episodeNumber: number;
  };
  error?: string;
}

export default function EpisodeActionMenu({
  episodeId,
  episodeTitle,
  episodeNumber,
  studyStatus,
  redirectTo,
  podcastSlug,
  redirectToEditedEpisode = false,
}: EpisodeActionMenuProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(episodeTitle);
  const [number, setNumber] = useState(String(episodeNumber));
  const [saving, setSaving] = useState(false);
  const [studyToggling, setStudyToggling] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleStudyToggle(closeMenu: () => void): Promise<void> {
    if (!studyStatus || studyStatus === 'learned') return;
    const nextStatus = studyStatus === 'studying' ? 'new' : 'studying';
    closeMenu();
    setStudyToggling(true);
    try {
      const response = await fetch(`/api/episodes/${episodeId}/study`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyStatus: nextStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Request failed (${response.status})`);
      }
      router.refresh();
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setStudyToggling(false);
    }
  }

  function openEdit(closeMenu: () => void): void {
    setTitle(episodeTitle);
    setNumber(String(episodeNumber));
    setTitleError(null);
    setNumberError(null);
    setFormError(null);
    closeMenu();
    setEditOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setTitleError(null);
    setNumberError(null);
    setFormError(null);

    const trimmedTitle = title.trim();
    const parsedNumber = Number(number);
    if (!trimmedTitle) {
      setTitleError('Title is required.');
      return;
    }

    if (!Number.isInteger(parsedNumber) || parsedNumber < 1) {
      setNumberError('Episode number must be a positive integer.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, episodeNumber: parsedNumber }),
      });
      const data: EpisodeUpdateResponse = await response
        .json()
        .catch(() => ({} as EpisodeUpdateResponse));

      if (!response.ok) {
        throw new Error(data.error ?? `Save failed (${response.status})`);
      }

      setEditOpen(false);
      if (
        redirectToEditedEpisode &&
        podcastSlug &&
        data.data &&
        data.data.episodeNumber !== episodeNumber
      ) {
        router.push(`/podcasts/${podcastSlug}/episodes/${data.data.episodeNumber}`);
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
      <ActionMenu ariaLabel={`Actions for ${episodeTitle}`}>
        {({ closeMenu }) => (
          <>
            {studyStatus !== 'learned' && studyStatus !== undefined && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleStudyToggle(closeMenu)}
                disabled={studyToggling}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-canvas-subtle disabled:opacity-50"
              >
                {studyStatus === 'studying' ? (
                  <BookOpenCheck size={16} aria-hidden="true" />
                ) : (
                  <BookOpen size={16} aria-hidden="true" />
                )}
                <span>{studyStatus === 'studying' ? 'Stop studying' : 'Start studying'}</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => openEdit(closeMenu)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-canvas-subtle"
            >
              <Pencil size={16} aria-hidden="true" />
              <span>Edit episode</span>
            </button>
            <DeleteMenuItem
              deleteUrl={`/api/episodes/${episodeId}`}
              confirmMessage={`Delete episode "${episodeTitle}" permanently? This will delete its audio, transcript, and study data.`}
              menuLabel="Delete episode"
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
        title="Edit episode"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            error={titleError ?? undefined}
            required
          />
          <Input
            type="number"
            label="Episode number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            error={numberError ?? undefined}
            required
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
              className="min-h-11"
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} className="min-h-11">
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
