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
   * FIXED (H6). `getCumulativeStandings` used to sort `season.rosters` in
   * place while picking the scoring crown:
   *
   *   season.rosters.sort((a, b) => ...fpts...)[0].roster_id
   *
   * `Array#sort` mutates, so merely rendering the standings permanently
   * reordered `seasons[year].rosters` for the rest of the session — 2025 went
   * from 1,2,3...12 to 4,7,2,10,1,9,12,3,8,5,6,11. Nothing visible depended on
   * that order, because the other helpers look rosters up by id, but it made
   * results depend on which page you happened to open first and would have
   * become genuinely confusing once A3 starts caching.
   *
   * It now copies before sorting. Keep this test: the shared `seasons` object
   * is read by every stat helper, and an in-place sort is an easy accident to
   * repeat.
   */
  it("getCumulativeStandings leaves seasons[year].rosters alone", () => {
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
