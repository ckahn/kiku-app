'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Shows a persistent banner while the browser is offline; renders nothing otherwise.
 *
 * Not yet wired into any page — this is the M1 (offline-groundwork) primitive; M3 hooks it
 * up alongside the download registry and offline-aware navigation.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="border-b border-border bg-warning-subtle px-4 py-2 text-center text-sm text-warning-on-subtle sm:px-6"
    >
      You&apos;re offline. Some content may be unavailable.
    </div>
  );
}
