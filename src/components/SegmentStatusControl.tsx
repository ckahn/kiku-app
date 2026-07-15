'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  STUDY_STATUS_VALUES,
  STUDY_STATUS_LABELS,
  type StudyStatus,
} from '@/lib/episodeStudyStatus';
import SegmentStatusIcon from '@/components/SegmentStatusIcon';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { mutateWithOutbox } from '@/lib/offline/mutateWithOutbox';
import { getErrorMessage } from '@/lib/utils';

const WILL_SYNC_HINT = 'Saved — will sync when online';

interface SegmentStatusControlProps {
  readonly segmentId: number;
  readonly initialStatus: StudyStatus;
}

/**
 * Dropdown to change a single segment's study status. Updates optimistically
 * and rolls back if the request fails. Offline (or on a transient failure),
 * the change is written to the local IndexedDB snapshot and queued for sync
 * via `mutateWithOutbox` instead of being blocked -- see the M4 section of
 * the `offline-support` skill.
 */
export default function SegmentStatusControl({
  segmentId,
  initialStatus,
}: SegmentStatusControlProps) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState<StudyStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);

  async function handleChange(next: StudyStatus): Promise<void> {
    const previous = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    setPendingSync(false);
    try {
      const result = await mutateWithOutbox({
        kind: 'segment-status',
        targetId: segmentId,
        status: next,
        isOnline,
      });
      if (result.outcome === 'synced') {
        // Refresh server components so the derived episode status stays in sync.
        router.refresh();
      } else {
        // Queued: there's no server to re-derive from (and on the offline
        // shell there's no RSC to refresh anyway) -- keep the optimistic value.
        setPendingSync(true);
      }
    } catch (caught: unknown) {
      setStatus(previous);
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <SegmentStatusIcon status={status} />
        </span>
        <label htmlFor={`segment-status-${segmentId}`} className="sr-only">
          Study status
        </label>
        <select
          id={`segment-status-${segmentId}`}
          value={status}
          disabled={saving}
          onChange={(event) => void handleChange(event.target.value as StudyStatus)}
          className="min-h-11 cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {STUDY_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {STUDY_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {pendingSync && !error && (
        <span className="text-xs text-muted">{WILL_SYNC_HINT}</span>
      )}
      {error && (
        <span role="alert" className="text-xs text-error-on-subtle">
          {error}
        </span>
      )}
    </div>
  );
}
