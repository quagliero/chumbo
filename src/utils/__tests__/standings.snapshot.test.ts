import { describe, expect, it } from "vitest";
import { YEARS } from "@/domain/constants";
import { getCumulativeStandings } from "@/utils/standings";

/**
 * Baseline snapshots for `getCumulativeStandings` (H1).
 *
 * NOTE: this function sorts `season.rosters` in place (see
 * `standings.ts`), which mutates the shared `seasons` object. Vitest isolates
 * modules per test file, so that leak is contained here; it is asserted
 * explicitly in `invariants.test.ts`.
 */
describe("getCumulativeStandings", () => {
  it("all-time (every year)", () => {
    expect(getCumulativeStandings([...YEARS])).toMatchSnapshot();
  });

  YEARS.forEach((year) => {
    it(`${year} only`, () => {
      expect(getCumulativeStandings([year])).toMatchSnapshot();
    });
  });

  it("returns nothing for a year with no data", () => {
    expect(getCumulativeStandings([1999])).toEqual([]);
  });
});
