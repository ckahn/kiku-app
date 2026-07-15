'use client';

import type { StudyStatus } from '@/lib/episodeStudyStatus';
import { discard, enqueue } from './outboxStore';
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
  const { kind, targetId, status, isOnline } = input;

  if (isOnline) {
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
      await applyOptimisticWrite(kind, targetId, status).catch(() => {});
      await discard(outboxEntryId(kind, targetId));
      return { outcome: 'synced' };
    }

    if (response && isPermanentReplayFailure(response.status)) {
      throw await parseResponseError(response);
    }
  }

  return queueOffline(input);
}
