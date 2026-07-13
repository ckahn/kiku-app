'use client';

import { AUDIO_CACHE_NAME } from './constants';
import { deleteEpisodeData, getAllDownloadRecords, putDownloadRecord } from './store';
import type { DownloadRecord, DownloadStep } from './types';

/**
 * Client-side reactive registry for episode download records — an in-memory
 * cache of what's persisted in the `downloads` IndexedDB store (store.ts),
 * kept in sync via a subscribe/notify model so `useSyncExternalStore` (see
 * `src/hooks/useDownloadRecord.ts`) can read it without re-hitting IndexedDB
 * on every render. See the `offline-support` skill for the full picture.
 */

type Listener = () => void;

const records = new Map<number, DownloadRecord>();
const listeners = new Set<Listener>();

let initialized = false;
let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;

  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel('kiku-downloads');
    broadcastChannel.onmessage = () => {
      void refresh();
    };
  }

  return broadcastChannel;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function notifyOtherTabs(): void {
  getBroadcastChannel()?.postMessage({ type: 'download-updated' });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(episodeId: number): DownloadRecord | undefined {
  return records.get(episodeId);
}

/** Reload every download record from IndexedDB, replacing the in-memory cache. */
export async function refresh(): Promise<void> {
  const stored = await getAllDownloadRecords();
  records.clear();
  for (const record of stored) records.set(record.episodeId, record);
  notify();
}

/**
 * Lazily loads the registry from IndexedDB exactly once per page load. Safe
 * to call from every consumer's mount effect — later calls are no-ops once
 * the first has resolved. A missing IndexedDB (jsdom tests, SSR-adjacent
 * contexts) is a silent no-op; a real load failure is logged and leaves the
 * registry empty rather than crashing consumers.
 */
export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (typeof indexedDB === 'undefined') return;

  try {
    await refresh();
  } catch (error: unknown) {
    console.error('[downloadStore] failed to load download records', error);
  }
}

async function persist(record: DownloadRecord): Promise<DownloadRecord> {
  await putDownloadRecord(record);
  records.set(record.episodeId, record);
  notify();
  notifyOtherTabs();
  return record;
}

function requireCurrent(episodeId: number): DownloadRecord {
  const current = records.get(episodeId);
  if (!current) {
    throw new Error(`No in-progress download record for episode ${episodeId}`);
  }
  return current;
}

export interface StartDownloadInput {
  readonly episodeId: number;
  readonly title: string;
  readonly podcastSlug: string;
  readonly episodeNumber: number;
  readonly guidesTotal: number;
}

export async function startDownload(input: StartDownloadInput): Promise<DownloadRecord> {
  const record: DownloadRecord = {
    episodeId: input.episodeId,
    status: 'downloading',
    step: 'guides',
    guidesCompleted: 0,
    guidesTotal: input.guidesTotal,
    audioBytes: 0,
    audioTotalBytes: null,
    bytesTotal: null,
    title: input.title,
    podcastSlug: input.podcastSlug,
    episodeNumber: input.episodeNumber,
    updatedAt: Date.now(),
  };
  return persist(record);
}

export type ProgressPatch = Partial<
  Pick<DownloadRecord, 'step' | 'guidesCompleted' | 'guidesTotal' | 'audioBytes' | 'audioTotalBytes'>
>;

export async function updateProgress(episodeId: number, patch: ProgressPatch): Promise<DownloadRecord> {
  const current = requireCurrent(episodeId);
  return persist({ ...current, ...patch, updatedAt: Date.now() });
}

export async function finishDownload(
  episodeId: number,
  bytesTotal: number | null
): Promise<DownloadRecord> {
  const current = requireCurrent(episodeId);
  const now = Date.now();
  return persist({
    ...current,
    status: 'complete',
    bytesTotal,
    error: undefined,
    updatedAt: now,
    completedAt: now,
  });
}

export async function failDownload(
  episodeId: number,
  step: DownloadStep,
  error: string
): Promise<DownloadRecord> {
  const current = requireCurrent(episodeId);
  return persist({ ...current, status: 'error', step, error, updatedAt: Date.now() });
}

/**
 * Removes an episode's offline data entirely: its IndexedDB rows (snapshot,
 * study guides, download record — cascaded in one transaction by
 * `deleteEpisodeData`) and its cached audio response in Cache Storage, so a
 * removed download doesn't silently keep occupying space via the service
 * worker's audio cache. Cache Storage cleanup is best-effort and
 * feature-guarded — it's unavailable in some test/SSR contexts, and a
 * failure there shouldn't block the IndexedDB cleanup that already
 * succeeded.
 */
export async function removeDownload(episodeId: number): Promise<void> {
  await deleteEpisodeData(episodeId);
  records.delete(episodeId);
  notify();
  notifyOtherTabs();

  if (!('caches' in globalThis)) return;

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.delete(`/api/episodes/${episodeId}/audio`, { ignoreSearch: true, ignoreVary: true });
  } catch (error: unknown) {
    console.error(`[downloadStore] failed to purge cached audio for episode ${episodeId}`, error);
  }
}

/** Test-only escape hatch: clears in-memory state and the init flag. */
export function resetDownloadStoreForTests(): void {
  records.clear();
  listeners.clear();
  initialized = false;
  broadcastChannel?.close();
  broadcastChannel = null;
}
