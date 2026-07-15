'use client';

import { useOutboxState } from '@/hooks/useOutbox';

/**
 * Shows how many offline study-status changes are queued for sync, and any
 * permanent replay-failure error, app-wide (mounted in src/app/layout.tsx
 * alongside OfflineBanner). Renders nothing when there's nothing to report.
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
      className="border-b border-border bg-warning-subtle px-4 py-2 text-center text-sm text-warning-on-subtle sm:px-6"
    >
      {countMessage}
      {countMessage && error && ' — '}
      {error}
    </div>
  );
}
