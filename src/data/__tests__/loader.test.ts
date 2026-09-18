import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEASON_FILE_PARTS } from "@/data/parts";
import { YEARS } from "@/domain/constants";

/**
 * The loader behind `seasons` and `getPlayer` (A2b).
 *
 * Every test here imports `@/data` fresh, after `resetModules`, because the
 * global setup has already loaded everything into the shared instance — and
 * the interesting behaviour is all about what happens before that.
 */

type Data = typeof import("@/data");

let data: Data;

beforeEach(async () => {
  vi.resetModules();
  data = await import("@/data");
});

/** The error a read threw, so a test can inspect and await it. */
const thrownBy = (read: () => unknown): unknown => {
  try {
    read();
  } catch (error) {
    return error;
  }
  throw new Error("expected the read to throw");
};

describe("a read before the data has loaded", () => {
  it("throws, for every guarded field, instead of answering empty", () => {
    const season = data.seasons[2014];
    const reads: Record<string, () => unknown> = {
      league: () => season.league,
      rosters: () => season.rosters,
      users: () => season.users,
      winners_bracket: () => season.winners_bracket,
      losers_bracket: () => season.losers_bracket,
      schedule: () => season.schedule,
      draft: () => season.draft,
      picks: () => season.picks,
      matchups: () => season.matchups,
      playerOverlay: () => data.seasons[2020].playerOverlay,
      getPlayer: () => data.getPlayer("4046"),
      getPlayers: () => data.getPlayers(),
    };

    for (const [name, read] of Object.entries(reads)) {
      expect(read, name).toThrow(data.DataNotLoadedError);
    }
  });

  it("names what was read, so a stray read outside render is findable", () => {
    const error = thrownBy(() => data.seasons[2014].rosters) as Error;
    expect(error.message).toContain("seasons[2014].rosters");
  });

  it("throws a thenable that settles once the data is in — which is how it suspends", async () => {
    const error = thrownBy(() => data.seasons[2014].rosters);
    expect(typeof (error as PromiseLike<void>).then).toBe("function");

    await error;

    expect(data.seasons[2014].rosters.length).toBeGreaterThan(0);
  });

  it("loads that part for every season, so a sweep is one round trip", async () => {
    await thrownBy(() => data.seasons[2013].winners_bracket);

    const years = Object.keys(data.seasons).map(Number);
    expect(data.areSeasonPartsLoaded(years, ["core"])).toBe(true);
    // ...and only that part.
    expect(data.areSeasonPartsLoaded([2013], ["draft"])).toBe(false);
    expect(data.areSeasonPartsLoaded([2013], ["matchups"])).toBe(false);
  });

  it("leaves transactions unguarded and empty, as A2a had them", () => {
    expect(data.seasons[2021].transactions).toEqual({});
  });
});

describe("loading", () => {
  it("loads a part of a season once, however many ask at the same time", async () => {
    const before = data.getDataVersion();

    await Promise.all([
      data.loadSeasonParts([2014], ["core"]),
      data.loadSeasonParts([2014], ["core"]),
      data.loadSeasons([2014]),
    ]);

    // One bump per part per season completed: core, draft, matchups.
    expect(data.getDataVersion() - before).toBe(3);
  });

  it("shares the in-flight player load", () => {
    expect(data.loadPlayers()).toBe(data.loadPlayers());
  });

  it("serves the second call from the cache", async () => {
    await data.loadSeasons([2014]);
    const rosters = data.seasons[2014].rosters;
    const version = data.getDataVersion();

    await data.loadSeasons([2014]);

    expect(data.getDataVersion()).toBe(version);
    expect(data.seasons[2014].rosters).toBe(rosters);
    expect(data.areSeasonsLoaded([2014])).toBe(true);
  });

  it("loads only the parts asked for", async () => {
    await data.loadSeasonParts([2014], ["core"]);

    expect(data.seasons[2014].rosters.length).toBeGreaterThan(0);
    expect(() => data.seasons[2014].picks).toThrow(data.DataNotLoadedError);
    expect(() => data.seasons[2015].rosters).toThrow(data.DataNotLoadedError);
  });

  // A season in progress has no brackets until its playoffs start. Between a
  // final and the next draft there is no such season, and nothing to test.
  const brackets = import.meta.glob("../*/winners_bracket.json");
  const bracketless = YEARS.find(
    (year) => !(`../${year}/winners_bracket.json` in brackets)
  );

  it.runIf(bracketless)(
    "gives a missing file a stand-in that is the same object every read",
    async () => {
      await data.loadSeasonParts([bracketless!], ["core"]);

      const bracket = data.seasons[bracketless!].winners_bracket;
      expect(bracket).toEqual([]);
      expect(data.seasons[bracketless!].winners_bracket).toBe(bracket);
    }
  );

  it("treats a year that is not a season as loaded and empty", async () => {
    await data.loadSeasons([1999]);

    expect(data.areSeasonsLoaded([1999])).toBe(true);
    expect(data.seasons[1999]).toBeUndefined();
  });

  it("applies a season's overlay to the dictionary", async () => {
    await data.loadPlayers();

    // Devin Funchess: a TE in the current dictionary, a WR when he played.
    const now = data.getPlayer("2346");
    const then = data.getPlayer("2346", 2019);
    expect(now?.full_name).toBe("Devin Funchess");
    expect(now?.position).toBe("TE");
    expect(then?.position).toBe("WR");
  });
});

describe("every season file on disk", () => {
  const onDisk = import.meta.glob<unknown>("../*/*.json", {
    eager: true,
    import: "default",
  });

  it("is claimed by exactly one part", () => {
    const unclaimed = Object.keys(onDisk).filter((file) => {
      const name = file.match(/\/(\d{4})\/(.+)\.json$/)?.[2];
      return !(
        name === "players.delta" ||
        (name !== undefined && name in SEASON_FILE_PARTS)
      );
    });

    // A new file type would otherwise be silently left out of every chunk.
    expect(unclaimed).toEqual([]);
  });

  it("arrives in its season's field, unchanged", async () => {
    await data.loadAllSeasons();

    for (const [file, raw] of Object.entries(onDisk)) {
      const [, year, name] = file.match(/\/(\d{4})\/(.+)\.json$/)!;
      if (name === "players.delta") {
        expect(data.seasons[Number(year)].playerOverlay, file).toEqual(raw);
      } else if (name !== "transactions") {
        const field = name as keyof (typeof data.seasons)[number];
        expect(data.seasons[Number(year)][field], file).toEqual(raw);
      }
    }
  });
});

describe("a download that fails", () => {
  /**
   * The retry loop. A failed load cleared its in-flight entry; React re-rendered
   * when the thrown promise settled; the re-render found the data still missing
   * and threw a fresh load, which failed at once — forever, behind a silent
   * "Loading…". Now the failure is remembered and the next read throws a real
   * error for the app's boundary, not another promise.
   */
  it("is remembered, and the next read throws an error instead of retrying", async () => {
    vi.resetModules();
    vi.doMock("@/data/2014/league.json", () => {
      throw new Error("offline");
    });
    const fresh = await import("@/data");

    await expect(fresh.loadSeasonParts([2014], ["core"])).rejects.toThrow();

    const error = thrownBy(() => fresh.seasons[2014].rosters);
    expect(error).toBeInstanceOf(fresh.DataLoadFailedError);
    // Not a thenable: React will not suspend on it, so nothing re-renders
    // into another attempt.
    expect((error as { then?: unknown }).then).toBeUndefined();

    // On navigation the failure is forgotten, and the read starts one new load.
    vi.doUnmock("@/data/2014/league.json");
    fresh.clearLoadFailure();
    const retry = thrownBy(() => fresh.seasons[2014].rosters);
    expect(retry).toBeInstanceOf(fresh.DataNotLoadedError);
    await retry;
    expect(fresh.seasons[2014].rosters.length).toBeGreaterThan(0);
  });
});
