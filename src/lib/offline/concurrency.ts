/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving
 * input order in the returned results. Used by the download orchestrator
 * (download.ts) to bound concurrent study-guide fetches
 * (STUDY_GUIDE_DOWNLOAD_CONCURRENCY in constants.ts).
 *
 * A rejection from any task propagates (via `Promise.all`) as soon as it
 * occurs; other in-flight tasks are not explicitly cancelled, but since
 * every caller in this codebase treats a rejection as "abort the whole
 * download," their results are discarded anyway.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
