import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../concurrency';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await delay(ms);
      return ms;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it('never runs more than `limit` tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active -= 1;
      return item;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('propagates a rejection from any task', async () => {
    const error = new Error('task failed');

    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw error;
        return item;
      })
    ).rejects.toThrow('task failed');
  });

  it('resolves to an empty array for an empty input', async () => {
    const results = await mapWithConcurrency([], 3, async (item) => item);
    expect(results).toEqual([]);
  });

  it('handles a limit larger than the item count', async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (item) => item * 2);
    expect(results).toEqual([2, 4]);
  });

  it('passes the item index to the mapper', async () => {
    const indices: number[] = [];
    await mapWithConcurrency(['a', 'b', 'c'], 2, async (item, index) => {
      indices.push(index);
      return item;
    });

    expect(indices.sort()).toEqual([0, 1, 2]);
  });
});
