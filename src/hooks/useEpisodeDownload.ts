'use client';

import { useCallback } from 'react';
import { useDownloadRecord } from '@/hooks/useDownloadRecord';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { downloadEpisode, type DownloadEpisodeInput } from '@/lib/offline/download';
import { isStale, removeDownload } from '@/lib/offline/downloadStore';
import type { DownloadRecord } from '@/lib/offline/types';

export interface EpisodeDownloadControls {
  /** Current registry record for this episode (undefined = never downloaded). */
  readonly record: DownloadRecord | undefined;
  /** True while a download is in flight — UI should disable the trigger. */
  readonly isBusy: boolean;
  /** False while offline or busy — the start action should be disabled. */
  readonly canStart: boolean;
  /** Kick off (or retry/resume) the download. No-op when !canStart. */
  readonly start: () => Promise<void>;
  /** Remove the stored download (IndexedDB rows + cached audio). */
  readonly remove: () => Promise<void>;
}

/**
 * UI-facing wrapper tying together the download orchestrator
 * (src/lib/offline/download.ts), the reactive registry record, and online
 * status. `start` is guarded: it does nothing while offline or while a
 * download for this episode is already running. Errors from the orchestrator
 * are absorbed here — downloadEpisode records failures in the registry
 * (status 'error' + message), which reaches the UI through `record`, so
 * throwing to the caller would only duplicate the signal.
 */
export function useEpisodeDownload(input: DownloadEpisodeInput): EpisodeDownloadControls {
  const record = useDownloadRecord(input.episodeId);
  const isOnline = useOnlineStatus();

  // A stale 'downloading' record (tab closed mid-download; no progress
  // writes for STALE_DOWNLOAD_MS) is not busy — treating it as busy would
  // make the episode permanently un-downloadable. Stale records are
  // restartable; downloadEpisode resumes from whatever already committed.
  const isBusy = record?.status === 'downloading' && !isStale(record);
  const canStart = isOnline && !isBusy;

  const { episodeId, title, podcastSlug, episodeNumber } = input;
  const start = useCallback(async () => {
    if (!isOnline || isBusy) return;
    try {
      await downloadEpisode({ episodeId, title, podcastSlug, episodeNumber });
    } catch (error: unknown) {
      // downloadEpisode already records failures in the registry; this
      // catch only guards against unexpected throws outside its phases.
      console.error(`[useEpisodeDownload] download for episode ${episodeId} threw`, error);
    }
  }, [isOnline, isBusy, episodeId, title, podcastSlug, episodeNumber]);

  const remove = useCallback(async () => {
    await removeDownload(episodeId);
  }, [episodeId]);

  return { record, isBusy, canStart, start, remove };
}
