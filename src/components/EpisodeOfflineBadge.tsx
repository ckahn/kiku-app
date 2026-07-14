'use client';

import { CloudDownload, HardDriveDownload } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useDownloadRecord } from '@/hooks/useDownloadRecord';
import { isStale } from '@/lib/offline/downloadStore';
import type { DownloadRecord } from '@/lib/offline/types';

interface EpisodeOfflineBadgeProps {
  episodeId: number;
  className?: string;
}

function progressLabel(record: DownloadRecord): string {
  if (record.step === 'guides') {
    return `Guides ${record.guidesCompleted}/${record.guidesTotal}`;
  }
  if (record.audioTotalBytes) {
    const percent = Math.min(100, Math.round((record.audioBytes / record.audioTotalBytes) * 100));
    return `Audio ${percent}%`;
  }
  return 'Audio…';
}

/**
 * Small status chip reflecting an episode's offline-download state:
 * progress while downloading, an "Offline" chip once complete, nothing
 * otherwise (no record, an errored download, or a stale 'downloading'
 * record left behind by a closed tab — the action menu owns the retry
 * affordance and error message; showing frozen progress here forever would
 * be misleading).
 *
 * SSR-safe: `useDownloadRecord`'s server snapshot is undefined, so the
 * server renders nothing and the first client render matches; the chip
 * appears a tick later once the registry loads from IndexedDB.
 */
export default function EpisodeOfflineBadge({ episodeId, className }: EpisodeOfflineBadgeProps) {
  const record = useDownloadRecord(episodeId);

  if (record?.status === 'downloading' && !isStale(record)) {
    return (
      <Badge variant="info" className={className}>
        <CloudDownload size={12} aria-hidden="true" className="mr-1" />
        {progressLabel(record)}
      </Badge>
    );
  }

  if (record?.status === 'complete') {
    return (
      <Badge variant="success" className={className} aria-label="Available offline">
        <HardDriveDownload size={12} aria-hidden="true" className="mr-1" />
        Offline
      </Badge>
    );
  }

  return null;
}
