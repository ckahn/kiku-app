'use client';

import type { StudyStatus } from '@/lib/episodeStudyStatus';
import { discard, enqueue, withTargetWriteLock } from './outboxStore';
import { isPermanentReplayFailure, outboxEntryId, toReplayRequest } from './outboxReplay';
import { setStoredEpisodeSegmentsStudyStatus, updateStoredSegmentStudyStatus } from './store';
import type { OutboxKind } from './types';

const MUTATE_METHOD = 'PATCH';
const NOT_DOWNLOADED_MESSAGE =
  "This episode isn't downloaded, so its study status can't be changed offline.";

export interface MutateInput {
  readonly kind: OutboxKind;
  readonly targetId: number;
  readonly status: StudyStatus;
  readonly isOnline: boolean;
}

export type MutateResult = { readonly outcome: 'synced' } | { readonly outcome: 'queued' };

/** Writes the optimistic snapshot update; returns whether a stored row existed to update. */
async function applyOptimisticWrite(
  kind: OutboxKind,
  targetId: number,
  status: StudyStatus
): Promise<boolean> {
  if (kind === 'segment-status') {
    return updateStoredSegmentStudyStatus(targetId, status);
  }
  const updatedCount = await setStoredEpisodeSegmentsStudyStatus(targetId, status);
  return updatedCount > 0;
}

async function parseResponseError(response: Response): Promise<Error> {
  const data: unknown = await response.json().catch(() => ({}));
  const message = (data as { error?: string }).error ?? `Request failed (${response.status})`;
  return new Error(message);
}

/**
 * Offline (or transient-failure) branch: attempt the optimistic IndexedDB
 * write. If a row existed (the episode is downloaded), enqueue the
 * coalesced outbox entry and report `queued`. If no row existed, roll back
 * by throwing -- preserving M3's "not usable offline" honesty for episodes
 * that were never downloaded.
 */
async function queueOffline(input: MutateInput): Promise<MutateResult> {
  const wrote = await applyOptimisticWrite(input.kind, input.targetId, input.status);
  if (!wrote) {
    throw new Error(NOT_DOWNLOADED_MESSAGE);
  }

  await enqueue({
    id: outboxEntryId(input.kind, input.targetId),
    kind: input.kind,
    targetId: input.targetId,
    status: input.status,
    clientTimestamp: Date.now(),
  });
  return { outcome: 'queued' };
}

/**
 * Online branch: PATCH through, holding the outbox write lock for this
 * target so a queued older value mid-replay can't land after this fresh
 * one (see `withTargetWriteLock` in `outboxStore.ts`). Returns a result on
 * success, throws on a permanent (4xx) failure, and returns `null` on a
 * transient failure so the caller falls back to queueing.
 */
async function attemptOnlineWrite(input: MutateInput): Promise<MutateResult | null> {
  const { kind, targetId, status } = input;
  const entryId = outboxEntryId(kind, targetId);

  return withTargetWriteLock(entryId, async () => {
    const { url, body } = toReplayRequest({ kind, targetId, status });
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        method: MUTATE_METHOD,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      response = null; // transient network failure -- fall through to queueing
    }

    if (response?.ok) {
      // Best-effort snapshot refresh: the server already accepted the write,
      // so a local refresh failure is logged, not surfaced.
      await applyOptimisticWrite(kind, targetId, status).catch((error: unknown) => {
        console.error(
          `[mutateWithOutbox] failed to refresh stored snapshot after online write (${entryId})`,
          error
        );
      });
      await discard(entryId);
      return { outcome: 'synced' as const };
    }

    if (response && isPermanentReplayFailure(response.status)) {
      throw await parseResponseError(response);
    }

    return null;
  });
}

/**
 * Shared decision point for both study-status controls (`SegmentStatusControl`,
 * `EpisodeActionMenu`'s study toggle) -- see the M4 section of the
 * `offline-support` skill for the full picture. Online success writes
 * through to the server, best-effort refreshes the stored row(s) so a
 * downloaded episode's snapshot doesn't drift stale, and clears any
 * previously-queued entry for the same target (an edge case: a stale queued
 * change must not later revert a fresh online write). An online *permanent*
 * failure (4xx) is a real validation error and is surfaced by throwing, not
 * queued. Everything else -- offline, or a transient failure while online --
 * falls back to `queueOffline`.
 */
export async function mutateWithOutbox(input: MutateInput): Promise<MutateResult> {
  if (input.isOnline) {
    const result = await attemptOnlineWrite(input);
    if (result) return result;
  }

  return queueOffline(input);
}
