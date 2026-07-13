'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// SSR-safe default: assume online when there is no `navigator` (server render).
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Tracks browser online/offline status via the `online`/`offline` window events,
 * initialized from `navigator.onLine`. SSR-safe (defaults to `true` when `navigator`
 * is unavailable).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
