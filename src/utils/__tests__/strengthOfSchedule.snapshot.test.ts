import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import { ExtendedLeague } from "@/types/league";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import {
  calculateStrengthOfSchedule,
  getStrengthOfSchedule,
} from "@/utils/strengthOfSchedule";
import { rostersFor } from "./helpers";

type SosSeason = {
  matchups: Record<string, ExtendedMatchup[]>;
  rosters: ExtendedRoster[];
  league: ExtendedLeague;
};

const sosInput = (year: number): SosSeason => {
  const season = seasons[year];
  return {
    matchups: (season?.matchups ?? {}) as unknown as Record<
      string,
      ExtendedMatchup[]
    >,
    rosters: rostersFor(year),
    league: season?.league as ExtendedLeague,
  };
};

/**
 * Baseline snapshots for `calculateStrengthOfSchedule` (H1).
 *
 * Note that this returns `{}` for any season whose league has no `leg`
 * setting or is otherwise finished — i.e. every completed season. Only the
 * in-progress season produces real ranks. That behaviour is captured here
 * deliberately.
 */
describe("calculateStrengthOfSchedule", () => {
  YEARS.forEach((year) => {
    it(`${year}`, () => {
      expect(calculateStrengthOfSchedule(sosInput(year))).toMatchSnapshot();
    });
  });

  it("returns {} when there are no matchups or rosters", () => {
    expect(
      calculateStrengthOfSchedule({} as unknown as SosSeason)
    ).toEqual({});
  });
});

describe("getStrengthOfSchedule", () => {
  YEARS.forEach((year) => {
    it(`${year} — per roster`, () => {
      const input = sosInput(year);
      const ranks: Record<string, number> = {};
      rostersFor(year).forEach((roster) => {
        ranks[`roster ${roster.roster_id}`] = getStrengthOfSchedule(
          roster.roster_id,
          input
        );
      });
      expect(ranks).toMatchSnapshot();
    });
  });
});
