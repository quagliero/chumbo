import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import { ExtendedMatchup } from "@/types/matchup";
import { OptimalLineupResult, getOptimalLineup } from "@/utils/lineupAnalysis";
import { weeksFor } from "./helpers";

/**
 * Baseline snapshots for `getOptimalLineup` (H1).
 *
 * One snapshot per season, keyed `w<week> r<roster_id>`, covering every
 * matchup entry in that season.
 */
describe("getOptimalLineup", () => {
  YEARS.forEach((year) => {
    it(`${year} — every matchup`, () => {
      const season = seasons[year];
      const matchups = season?.matchups as unknown as
        | Record<string, ExtendedMatchup[]>
        | undefined;
      const results: Record<string, OptimalLineupResult> = {};

      weeksFor(year).forEach((week) => {
        const weekMatchups = matchups?.[String(week)];
        if (!weekMatchups) return;
        [...weekMatchups]
          .sort((a, b) => a.roster_id - b.roster_id)
          .forEach((matchup) => {
            results[`w${week} r${matchup.roster_id}`] = getOptimalLineup(
              matchup,
              year
            );
          });
      });

      expect(results).toMatchSnapshot();
    });
  });

  it("handles a matchup with no players", () => {
    expect(
      getOptimalLineup({ points: 0 } as unknown as ExtendedMatchup, 2025)
    ).toEqual({ optimalTotal: 0, pointsLeftOnBench: 0 });
  });
});
