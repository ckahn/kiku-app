'use client';

import { Download, Trash2 } from 'lucide-react';
import { useEpisodeDownload } from '@/hooks/useEpisodeDownload';
import type { DownloadRecord } from '@/lib/offline/types';

interface EpisodeDownloadMenuItemProps {
  episodeId: number;
  episodeTitle: string;
  episodeNumber: number;
  podcastSlug: string;
  closeMenu: () => void;
}

const MENU_ITEM_CLASS =
  'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-50';

function downloadingLabel(record: DownloadRecord): string {
  if (record.step === 'guides') {
    return `Study guides ${record.guidesCompleted}/${record.guidesTotal}`;
  }
  if (record.audioTotalBytes) {
    const percent = Math.min(100, Math.round((record.audioBytes / record.audioTotalBytes) * 100));
    return `Audio ${percent}%`;
  }
  return 'Downloading audio…';
}

/**
 * Offline-download actions for the episode action menu: start ("Make
 * available offline"), live progress while downloading, retry after an
 * error, and remove (confirm-guarded) once complete. Rendered inside
 * ActionMenu's popup, so items follow the existing menuitem styling
 * (min-h-11 touch target, pointer cursor).
 */
export default function EpisodeDownloadMenuItem({
  episodeId,
  episodeTitle,
  episodeNumber,
  podcastSlug,
  closeMenu,
}: EpisodeDownloadMenuItemProps) {
  const { record, isBusy, canStart, start, remove } = useEpisodeDownload({
    episodeId,
    title: episodeTitle,
    podcastSlug,
    episodeNumber,
  });

  function handleStart(): void {
    closeMenu();
    void start();
  }

  function handleRemove(): void {
    const confirmed = window.confirm(
      `Remove the offline download of "${episodeTitle}"? Its audio and study guides will need to be downloaded again.`
    );
    closeMenu();
    if (!confirmed) return;
    void remove();
  }

  if (record?.status === 'complete') {
    return (
      <button type="button" role="menuitem" onClick={handleRemove} className={MENU_ITEM_CLASS}>
        <Trash2 size={16} aria-hidden="true" />
        <span>Remove download</span>
      </button>
    );
  }

  if (record?.status === 'downloading') {
    return (
      <button type="button" role="menuitem" disabled className={MENU_ITEM_CLASS}>
        <Download size={16} aria-hidden="true" />
        <span>{downloadingLabel(record)}</span>
      </button>
    );
  }

  const isRetry = record?.status === 'error';
  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={handleStart}
        disabled={!canStart || isBusy}
        className={MENU_ITEM_CLASS}
      >
        <Download size={16} aria-hidden="true" />
        <span>{isRetry ? 'Retry download' : 'Make available offline'}</span>
      </button>
      {isRetry && record.error && (
        <p className="px-3 pb-2 pt-1 text-xs text-error-on-subtle">{record.error}</p>
      )}
    </>
  );
}
