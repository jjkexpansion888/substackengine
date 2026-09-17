/**
 * Bounded-concurrency worker pool. Runs `worker` over `items` with at most
 * `concurrency` in flight, preserves input order in the results, and contains
 * worker rejections per item — one failed lookup must never abort a sync run
 * (spec AC5); callers inspect the settled results.
 */
export type PoolItemResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export async function pooledMap<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: { concurrency: number },
): Promise<PoolItemResult<R>[]> {
  const { concurrency } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const results: PoolItemResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function takeNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        const value = await worker(items[index], index);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const laneCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: laneCount }, () => takeNext()));
  return results;
}
