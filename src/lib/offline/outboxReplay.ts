import type { OutboxEntry } from './types';

const PERMANENT_MIN_STATUS = 400;
const PERMANENT_MAX_STATUS = 500;

// 408 (timeout) and 429 (rate limit) are 4xx but transient -- worth retrying.
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429]);

export interface ReplayRequest {
  readonly url: string;
  readonly body: { readonly studyStatus: OutboxEntry['status'] };
}

/**
 * Derives the fetch request for a queued outbox entry. The url/method/body
 * are intentionally NOT stored on the entry itself (see `types.ts`) --
 * deriving them here at replay time means a future route rename can't
 * strand already-queued entries with a stale URL. Both target routes are
 * PATCH (see the `offline-support` skill), so the method is a caller-side
 * constant rather than part of this mapper's output.
 */
export function toReplayRequest(entry: OutboxEntry): ReplayRequest {
  const url =
    entry.kind === 'segment-status'
      ? `/api/segments/${entry.targetId}/study`
      : `/api/episodes/${entry.targetId}/study`;

  return { url, body: { studyStatus: entry.status } };
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
