import { describe, expect, it, beforeEach } from "vitest";
import {
  clearStatCache,
  memoiseOverSeasons,
  statCacheSize,
} from "@/utils/cache";
import { getManagerStats } from "@/utils/managerStats";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import managers from "@/data/managers.json";

/**
 * A stale cache is a worse failure than a slow page: it shows numbers that
 * were true a moment ago and silently keeps showing them. These pin the
 * properties that make it safe.
 */
describe("stat cache", () => {
  beforeEach(() => clearStatCache());

  it("returns the same value it would have computed", () => {
    const withManagers = managers.filter((m) => m.sleeper);

    withManagers.forEach((manager) => {
      const first = getManagerStats(manager.id, "regular");
      const second = getManagerStats(manager.id, "regular");
      // Same reference on a hit, and equal by value either way.
      expect(second).toBe(first);
      expect(second).toEqual(first);
    });
  });

  it("keys on every argument, not just the first", () => {
    const id = managers.find((m) => m.sleeper)!.id;

    const regular = getManagerStats(id, "regular");
    const playoffs = getManagerStats(id, "playoffs");

    // Distinct entries, not one result served for both modes.
    expect(playoffs).not.toBe(regular);
    // And genuinely different numbers, so a key collision would be visible
    // rather than merely theoretical.
    expect(regular?.totalWins).toBeGreaterThan(playoffs?.totalWins ?? 0);
  });

  it("applies the default argument before keying", () => {
    const id = managers.find((m) => m.sleeper)!.id;

    // Calling with and without the default must not produce two entries.
    getManagerStats(id);
    const size = statCacheSize();
    getManagerStats(id, "regular");

    expect(statCacheSize()).toBe(size);
  });

  it("evicts least-recently-used beyond the bound", () => {
    let calls = 0;
    const memoised = memoiseOverSeasons(
      "test-bound",
      (n: number) => {
        calls += 1;
        return n * 2;
      },
      3
    );

    memoised(1);
    memoised(2);
    memoised(3);
    expect(calls).toBe(3);

    memoised(1); // refresh recency of 1
    expect(calls).toBe(3);

    memoised(4); // evicts 2, the least recently used
    expect(calls).toBe(4);

    memoised(1); // still held
    expect(calls).toBe(4);

    memoised(2); // was evicted, recomputes
    expect(calls).toBe(5);
  });

  it("holds the whole H2H grid without thrashing", () => {
    const owners = managers
      .filter((m) => m.sleeper)
      .map((m) => m.sleeper!.id);

    let misses = 0;
    const seen = new Set<string>();
    owners.forEach((a) =>
      owners.forEach((b) => {
        if (a === b) return;
        const key = `${a}|${b}`;
        if (!seen.has(key)) {
          seen.add(key);
          misses += 1;
        }
        getAllTimeH2HRecord(a, b);
      })
    );

    // Every distinct pairing computed once; a second sweep must add nothing.
    const afterFirst = statCacheSize();
    owners.forEach((a) =>
      owners.forEach((b) => a !== b && getAllTimeH2HRecord(a, b))
    );

    expect(statCacheSize()).toBe(afterFirst);
    expect(afterFirst).toBe(misses);
  });
});
