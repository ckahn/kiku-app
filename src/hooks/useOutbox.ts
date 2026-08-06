'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  ensureOutboxInitialized,
  getStateSnapshot,
  subscribe,
  type OutboxState,
} from '@/lib/offline/outboxStore';

// SSR-safe default: no IndexedDB on the server, so there is no queue yet.
function getServerSnapshot(): OutboxState {
  return { count: 0, error: null };
}

/**
 * Reactive read of the offline mutation outbox, backed by the in-memory
 * queue in `src/lib/offline/outboxStore.ts`. Mounting this hook triggers the
 * store's one-time IndexedDB load and installs the `online` listener that
 * drives replay (`ensureOutboxInitialized` is a no-op after the first call).
 *
 * SSR-safe: the server snapshot is always `{ count: 0, error: null }`; the
 * real value (if any) arrives a tick later once initialization resolves.
 */
export function useOutboxState(): OutboxState {
  useEffect(() => {
    void ensureOutboxInitialized();
  }, []);

  return useSyncExternalStore(subscribe, getStateSnapshot, getServerSnapshot);
}
