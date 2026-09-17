import { beforeAll, describe, expect, it } from "vitest";
// Imported through Vite rather than read with `fs`: the app tsconfig covers
// src/ and has no node types, and `?raw` gives the exact bytes that get served.
import raw from "../../../public/data/all-time.json?raw";
import { loadAllSeasons } from "@/data";
import {
  allStats,
  caveatSeasons,
  computeStat,
  excludedSeasons,
} from "@/utils/stats";
import {
  PRECOMPUTED_VERSION,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";

/**
 * A4: the site serves `public/data/all-time.json` instead of computing these in
 * the browser, so the file IS the answer as far as any reader is concerned.
 *
 * A stale file is the failure mode that matters, and it is a quiet one: the
 * page renders perfectly, with last month's records. `yarn build` and the fetch
 * scripts both regenerate it, but a hand edit to season data would not, so
 * assert it here too — this is the check that runs without anyone remembering
 * to run it.
 */
const file: PrecomputedStats = JSON.parse(raw);

beforeAll(async () => {
  await loadAllSeasons();
});

describe("precomputed all-time stats", () => {
  it("is the version the client expects", () => {
    expect(file.version).toBe(PRECOMPUTED_VERSION);
  });

  it("covers every registered stat", () => {
    expect(file.stats.map((s) => s.id).sort()).toEqual(
      allStats()
        .map((s) => s.id)
        .sort()
    );
  });

  it("matches what the registry computes right now", () => {
    const stale: string[] = [];

    for (const definition of allStats()) {
      const live = computeStat(definition.id);
      const stored = file.stats.find((s) => s.id === definition.id);
      if (!stored) continue;

      if (stored.total !== live.length) {
        stale.push(`${definition.id}: file has ${stored.total} entries, registry has ${live.length}`);
        continue;
      }
      const expected = live.slice(0, file.limit);
      if (JSON.stringify(stored.entries) !== JSON.stringify(expected)) {
        stale.push(`${definition.id}: top ${file.limit} entries differ`);
      }
    }

    // If this fails the data changed without the file being rebuilt.
    expect(stale, "run `yarn build-aggregates`").toEqual([]);
  });

  it("carries the data-quality flags the UI needs to caveat an entry", () => {
    for (const definition of allStats()) {
      const stored = file.stats.find((s) => s.id === definition.id)!;
      expect(stored.excluded).toEqual(excludedSeasons(definition));
      expect(stored.caveat).toEqual(caveatSeasons(definition));
    }

    // The flags are only worth carrying if they actually reach an entry.
    const flagged = file.stats.flatMap((s) => s.entries).filter((e) => e.approximate);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((e) => e.year === 2019)).toBe(true);
  });

  it("is small enough to be worth serving", () => {
    // The whole point is to avoid downloading every matchup and transaction to
    // answer these. If the file ever approaches that, the trade is gone.
    expect(raw.length / 1024).toBeLessThan(400);
  });
});
