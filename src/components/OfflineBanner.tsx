'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Shows a persistent banner while the browser is offline; renders nothing otherwise.
 *
 * Wired into the root layout (src/app/layout.tsx) since M3, so it appears app-wide —
 * including on the offline app-shell.
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
