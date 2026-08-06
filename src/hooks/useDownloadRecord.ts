'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ensureInitialized, getSnapshot, subscribe } from '@/lib/offline/downloadStore';
import type { DownloadRecord } from '@/lib/offline/types';

// SSR-safe default: no IndexedDB on the server, so there is no record yet.
function getServerSnapshot(): DownloadRecord | undefined {
  return undefined;
}

/**
 * Reactive read of a single episode's offline-download record, backed by the
 * in-memory registry in `src/lib/offline/downloadStore.ts`. Triggers the
 * registry's one-time IndexedDB load on mount (`ensureInitialized` is a
 * no-op after the first call, so multiple components mounting at once don't
 * cause redundant reads).
 *
 * SSR-safe: the server snapshot is always `undefined`. Consumers should
 * treat `undefined` the same as "not downloaded" so the first client render
 * matches the server-rendered markup — the real value (if any) arrives a
 * tick later once `ensureInitialized` resolves and notifies subscribers.
 */
export function useDownloadRecord(episodeId: number): DownloadRecord | undefined {
  const subscribeToStore = useCallback((onStoreChange: () => void) => subscribe(onStoreChange), []);
  const getStoreSnapshot = useCallback(() => getSnapshot(episodeId), [episodeId]);

  useEffect(() => {
    void ensureInitialized();
  }, []);

  return useSyncExternalStore(subscribeToStore, getStoreSnapshot, getServerSnapshot);
}
