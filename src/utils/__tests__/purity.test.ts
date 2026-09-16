import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import { getCumulativeStandings } from "@/utils/standings";

/**
 * The stat helpers read from the shared, immutable `seasons` object. None of
 * them should write to it.
 *
 * This lives in its own file because Vitest gives each test file a fresh
 * module registry — the mutation documented below would otherwise leak into
 * whatever ran next.
 */
describe("stat helpers do not mutate the shared season data", () => {
  /**
   * KNOWN FAILURE — `getCumulativeStandings` sorts `season.rosters` in place:
   *
   *   season.rosters.sort((a, b) => ...fpts...)[0].roster_id
   *
   * (`src/utils/standings.ts`, the `scoringCrown` calculation). `Array#sort`
   * mutates, so merely rendering the standings permanently reorders
   * `seasons[year].rosters` for the rest of the page session. For 2025 the
   * roster order goes from 1,2,3...12 to 4,7,2,10,1,9,12,3,8,5,6,11.
   *
   * Nothing visible depends on that order today — the other helpers look
   * rosters up by id — but it is a live footgun for anything that iterates
   * rosters positionally, and it makes results order-dependent on which page
   * you visited first. The fix is one character: `[...season.rosters].sort()`.
   */
  it.fails("getCumulativeStandings leaves seasons[year].rosters alone", () => {
    const before = YEARS.map((year) =>
      (seasons[year]?.rosters ?? []).map((r) => r.roster_id).join(",")
    );

    getCumulativeStandings([...YEARS]);

    const after = YEARS.map((year) =>
      (seasons[year]?.rosters ?? []).map((r) => r.roster_id).join(",")
    );

    expect(after).toEqual(before);
  });
});
