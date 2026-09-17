import { afterEach, describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { deriveLegacyPlayers, legacyPlayers } from "@/data/legacyPlayers";
import { searchPlayers } from "../usePlayerSearch";

/**
 * The bug this file exists for.
 *
 * `usePlayerSearch` used to find the legacy string-named players by sweeping
 * `seasons[].matchups`. A2a made those lazy, so the sweep saw only the seasons
 * the visitor had already opened: the same query returned nothing for "Beanie"
 * on a cold /players and one result after a visit to /seasons/2012. The page hid
 * it by loading every season — 305 kB gzip — to find 39 names.
 *
 * So the property to hold is navigation-independence: the answer must not depend
 * on what is loaded. `hideMatchups` below is the cold visitor.
 */
const loaded = Object.entries(seasons).map(
  ([year, season]) => [Number(year), season.matchups] as const
);

/** Make every season look unopened, as it does on a first page load. */
const hideMatchups = () => {
  for (const [year] of loaded) seasons[year].matchups = {};
};

afterEach(() => {
  for (const [year, matchups] of loaded) seasons[year].matchups = matchups;
});

const names = (term: string) => searchPlayers(term).map((r) => r.full_name);

describe("player search", () => {
  it("finds a legacy string-named player", () => {
    expect(names("Beanie")).toEqual(["Beanie Wells"]);
  });

  it("finds every legacy string-named player by name", () => {
    for (const name of Object.keys(legacyPlayers)) {
      expect(names(name), name).toContain(name);
    }
  });

  it("gives a legacy player the position the archive recorded", () => {
    const [beanie] = searchPlayers("Beanie Wells");
    expect(beanie.position).toBe("RB");
    expect(beanie.fantasy_positions).toEqual(["RB"]);
    expect(beanie.player_id).toBe("Beanie Wells");
  });

  it("answers the same with no season loaded as with all of them", () => {
    // Anything but "a" broad prefix would make this weaker than it looks: a term
    // that matches both corpora at once is the one that used to change.
    const terms = ["Beanie", "Jake", "Tony", "a", "RB", "12"];
    const withArchive = terms.map((term) => names(term));

    hideMatchups();

    expect(terms.map((term) => names(term))).toEqual(withArchive);
  });

  it("still finds the legacy players with no season loaded", () => {
    hideMatchups();
    expect(names("Beanie")).toEqual(["Beanie Wells"]);
    expect(names("Jermichael")).toEqual(["Jermichael Finley"]);
  });

  it("returns nothing for an empty term", () => {
    expect(searchPlayers("   ")).toEqual([]);
  });
});

/**
 * The generated table is the search corpus now, so a stale one is a quiet
 * failure: the page renders, without a player it used to find. This is the
 * check that runs without anyone remembering to run `yarn build-aggregates`.
 */
describe("legacy player table", () => {
  it("matches what the archive contains right now", () => {
    const live = deriveLegacyPlayers(
      Object.values(seasons).flatMap((season) =>
        Object.values(season.matchups ?? {})
      )
    );

    expect(legacyPlayers).toEqual(live);
  });

  it("is not empty, or the test above proves nothing", () => {
    expect(Object.keys(legacyPlayers).length).toBeGreaterThan(30);
  });
});
