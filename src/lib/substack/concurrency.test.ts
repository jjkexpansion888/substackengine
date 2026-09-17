import { describe, expect, it } from "vitest";
import { pooledMap } from "./concurrency";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("pooledMap", () => {
  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    const results = await pooledMap(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
        return n * 2;
      },
      { concurrency: 2 },
    );

    expect(peak).toBe(2);
    expect(results).toEqual(
      [2, 4, 6, 8, 10, 12, 14].map((value) => ({ status: "fulfilled", value })),
    );
  });

  it("preserves input order regardless of completion order", async () => {
    const results = await pooledMap(
      [300, 100, 200],
      async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        return ms;
      },
      { concurrency: 3 },
    );
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([300, 100, 200]);
  });

  it("contains worker rejections per item instead of aborting", async () => {
    const results = await pooledMap(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error(`boom ${n}`);
        return n;
      },
      { concurrency: 2 },
    );

    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1]).toEqual({ status: "rejected", reason: new Error("boom 2") });
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("handles an empty input and validates concurrency", async () => {
    expect(await pooledMap([], async (n) => n, { concurrency: 2 })).toEqual([]);
    await expect(pooledMap([1], async (n) => n, { concurrency: 0 })).rejects.toThrow(/concurrency/);
  });
});
