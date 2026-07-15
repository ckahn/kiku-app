'use client';

import { useOutboxState } from '@/hooks/useOutbox';
import { acknowledgeError, retry } from '@/lib/offline/outboxStore';

/**
 * Shows how many offline study-status changes are queued for sync, and any
 * permanent replay-failure error, app-wide (mounted in src/app/layout.tsx
 * alongside OfflineBanner). Renders nothing when there's nothing to report.
 *
 * "Retry now" drains the queue on demand — a transient failure hit while
 * genuinely online never gets an `online` event to retry it, so without a
 * manual trigger those entries would wait for the next connectivity blip.
 * The dismiss control clears the sticky error, which otherwise only clears
 * on a later successful replay.
 *
 * A dedicated component rather than folding into OfflineBanner -- connectivity
 * and sync-queue state are different concerns that can co-occur (e.g. back
 * online with a queue still draining). Mounting this component's
 * `useOutboxState()` hook triggers `ensureOutboxInitialized()`, which installs
 * the `online` listener that drives replay -- see the M4 section of the
 * `offline-support` skill.
 */
export default function PendingChangesIndicator() {
  const { count, error } = useOutboxState();

  if (count === 0 && !error) return null;

  const countMessage = count > 0 ? `${count} change${count === 1 ? '' : 's'} waiting to sync` : null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-warning-subtle px-4 py-1 text-center text-sm text-warning-on-subtle sm:px-6"
    >
      {countMessage && <span>{countMessage}</span>}
      {countMessage && error && <span aria-hidden="true">—</span>}
      {error && <span>{error}</span>}
      {count > 0 && (
        <button
          type="button"
          onClick={() => void retry()}
          className="min-h-11 min-w-11 cursor-pointer px-2 font-medium underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          Retry now
        </button>
      )}
      {error && (
        <button
          type="button"
          aria-label="Dismiss sync error"
          onClick={acknowledgeError}
          className="min-h-11 min-w-11 cursor-pointer px-2 font-medium underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
