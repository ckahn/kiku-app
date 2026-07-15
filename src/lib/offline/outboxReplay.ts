import type { OutboxEntry, OutboxKind } from './types';

const PERMANENT_MIN_STATUS = 400;
const PERMANENT_MAX_STATUS = 500;

// 408 (timeout) and 429 (rate limit) are 4xx but transient -- worth retrying.
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429]);

export interface ReplayRequest {
  readonly url: string;
  readonly body: { readonly studyStatus: OutboxEntry['status'] };
}

/** The subset of an outbox entry needed to derive its replay request. */
export type ReplayTarget = Pick<OutboxEntry, 'kind' | 'targetId' | 'status'>;

/**
 * The coalescing key for a queued entry -- enqueuing another entry for the
 * same (kind, targetId) overwrites this one (last-write-wins), and it's also
 * the key `mutateWithOutbox` uses to clear a stale queued entry after a
 * fresh online success.
 */
export function outboxEntryId(kind: OutboxKind, targetId: number): string {
  return `${kind}:${targetId}`;
}

/**
 * Derives the fetch request for a queued outbox entry (or an in-flight
 * mutation about to be queued). The url/method/body are intentionally NOT
 * stored on the entry itself (see `types.ts`) -- deriving them here at
 * replay time means a future route rename can't strand already-queued
 * entries with a stale URL. Both target routes are PATCH (see the
 * `offline-support` skill), so the method is a caller-side constant rather
 * than part of this mapper's output.
 */
export function toReplayRequest(target: ReplayTarget): ReplayRequest {
  const url =
    target.kind === 'segment-status'
      ? `/api/segments/${target.targetId}/study`
      : `/api/episodes/${target.targetId}/study`;

  return { url, body: { studyStatus: target.status } };
}

/**
 * A permanent failure means the mutation itself is invalid or its target is
 * gone (e.g. 404 -- segment deleted server-side; 400 -- bad status) --
 * retrying can never succeed, so the caller drops the entry instead of
 * looping on it forever. Everything else (network throw, 5xx, 408, 429) is
 * transient: the caller keeps the entry and retries on the next `online`
 * event.
 */
export function isPermanentReplayFailure(status: number): boolean {
  return (
    status >= PERMANENT_MIN_STATUS &&
    status < PERMANENT_MAX_STATUS &&
    !RETRYABLE_STATUSES.has(status)
  );
}
