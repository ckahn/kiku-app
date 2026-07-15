'use client';

import { deleteOutboxEntry, getAllOutboxEntries, putOutboxEntry } from './store';
import { isPermanentReplayFailure, toReplayRequest } from './outboxReplay';
import type { OutboxEntry } from './types';

/**
 * Client-side reactive queue of offline study-status mutations, modeled on
 * `downloadStore.ts`: an in-memory mirror of the `outbox` IndexedDB store,
 * subscribe/notify for `useSyncExternalStore` (`src/hooks/useOutbox.ts`),
 * `BroadcastChannel('kiku-outbox')` cross-tab sync, and a lazy one-time
 * `ensureOutboxInitialized()` that also installs the single `online`
 * listener that drives FIFO replay. See the `offline-support` skill.
 */

type Listener = () => void;

const PERMANENT_FAILURE_MESSAGE = "A change couldn't be synced and was discarded.";
const REPLAY_METHOD = 'PATCH';

export interface OutboxState {
  readonly count: number;
  readonly error: string | null;
}

const entries = new Map<string, OutboxEntry>();
const listeners = new Set<Listener>();

let initialized = false;
let replaying = false;
let lastError: string | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let onlineListener: (() => void) | null = null;

// Cached so `useSyncExternalStore` gets a referentially-stable snapshot
// between real changes. Rebuilding a fresh `{ count, error }` object on
// every `getStateSnapshot()` call would make React think the store changed
// on every render, causing an infinite re-render loop (this is the risk
// flagged in the M4 plan). Only `notify()` rebuilds it.
let cachedState: OutboxState = { count: 0, error: null };

function rebuildCachedState(): void {
  cachedState = { count: entries.size, error: lastError };
}

function notify(): void {
  rebuildCachedState();
  for (const listener of listeners) listener();
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;

  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel('kiku-outbox');
    broadcastChannel.onmessage = () => {
      void refresh();
    };
  }

  return broadcastChannel;
}

// The message is a pure "something changed" ping, same as downloadStore --
// the receiving tab reloads from IndexedDB (the source of truth) rather
// than trusting a payload.
function notifyOtherTabs(): void {
  getBroadcastChannel()?.postMessage(null);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStateSnapshot(): OutboxState {
  return cachedState;
}

/** Reload every outbox entry from IndexedDB, replacing the in-memory cache. */
export async function refresh(): Promise<void> {
  const stored = await getAllOutboxEntries();
  entries.clear();
  for (const entry of stored) entries.set(entry.id, entry);
  notify();
}

function installOnlineListener(): void {
  if (onlineListener || typeof window === 'undefined') return;
  onlineListener = () => {
    void replay();
  };
  window.addEventListener('online', onlineListener);
}

/**
 * Lazily loads the queue from IndexedDB exactly once per page load and
 * installs the `online` listener that drives replay. Safe to call from
 * every consumer's mount effect. A missing IndexedDB (jsdom tests,
 * SSR-adjacent contexts) is a silent no-op; a real load failure is logged
 * and leaves the queue empty rather than crashing consumers.
 *
 * If the queue is non-empty and the browser is already online at init time,
 * kicks one replay immediately -- this drains a queue left behind by a
 * previous session that was closed before reconnecting.
 */
export async function ensureOutboxInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
  installOnlineListener();
  if (typeof indexedDB === 'undefined') return;

  try {
    await refresh();
  } catch (error: unknown) {
    console.error('[outboxStore] failed to load outbox entries', error);
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine && entries.size > 0) {
    void replay();
  }
}

/**
 * Enqueues a coalesced entry: `putOutboxEntry` overwrites any existing entry
 * with the same `id` (the target's coalescing key), so repeatedly flipping
 * one segment's status offline leaves exactly one queued entry carrying the
 * latest status + timestamp (last-write-wins).
 */
export async function enqueue(entry: OutboxEntry): Promise<void> {
  await putOutboxEntry(entry);
  entries.set(entry.id, entry);
  notify();
  notifyOtherTabs();
}

/** Removes a queued entry without replaying it (e.g. superseded by a fresh online write). */
export async function discard(id: string): Promise<void> {
  await deleteOutboxEntry(id);
  if (entries.delete(id)) {
    notify();
    notifyOtherTabs();
  }
}

/**
 * Drains the queue in FIFO order (by `clientTimestamp`) via a fresh PATCH
 * for each entry. A `replaying` guard means overlapping `online` events
 * cannot double-drain the queue.
 *
 * Failure handling (D5 in the M4 plan):
 * - success -> delete the entry, keep going.
 * - permanent failure (4xx excluding 408/429) -> the mutation is invalid or
 *   its target is gone; drop the entry and record a user-visible error.
 * - transient failure (network throw, 5xx, 408, 429) -> keep the entry and
 *   stop the loop immediately so FIFO ordering holds for the next attempt
 *   (skipping ahead would break last-write-wins ordering guarantees).
 */
export async function replay(): Promise<void> {
  if (replaying) return;
  replaying = true;

  try {
    const ordered = [...entries.values()].sort(
      (a, b) => a.clientTimestamp - b.clientTimestamp
    );

    for (const entry of ordered) {
      const { url, body } = toReplayRequest(entry);

      let response: Response;
      try {
        response = await fetch(url, {
          method: REPLAY_METHOD,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        return; // transient: network failure, stop the loop
      }

      if (response.ok) {
        await deleteOutboxEntry(entry.id);
        entries.delete(entry.id);
        lastError = null;
        notify();
        notifyOtherTabs();
        continue;
      }

      if (isPermanentReplayFailure(response.status)) {
        await deleteOutboxEntry(entry.id);
        entries.delete(entry.id);
        lastError = PERMANENT_FAILURE_MESSAGE;
        notify();
        notifyOtherTabs();
        continue;
      }

      return; // transient HTTP failure (5xx/408/429): stop the loop
    }
  } finally {
    replaying = false;
  }
}

/** Test-only escape hatch: clears in-memory state, the init flag, and the online listener. */
export function resetOutboxStoreForTests(): void {
  entries.clear();
  listeners.clear();
  initialized = false;
  replaying = false;
  lastError = null;
  if (onlineListener && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineListener);
  }
  onlineListener = null;
  broadcastChannel?.close();
  broadcastChannel = null;
  cachedState = { count: 0, error: null };
}
