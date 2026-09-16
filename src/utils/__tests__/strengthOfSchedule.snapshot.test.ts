import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import { ExtendedLeague } from "@/types/league";
import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { CURRENT_YEAR } from "@/domain/constants";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { getCompletedWeek } from "@/utils/weekUtils";
import {
  calculateStrengthOfSchedule,
  getStrengthOfSchedule,
} from "@/utils/strengthOfSchedule";
import { rostersFor } from "./helpers";

type SosSeason = {
  matchups: Record<string, ExtendedMatchup[]>;
  rosters: ExtendedRoster[];
  league: ExtendedLeague;
  schedule?: Record<string, ScheduledMatchup[]>;
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
    schedule: season?.schedule,
  };
};

/**
 * Average points scored by each roster's *remaining* opponents, worked out
 * here from `schedule.json` and the played weeks without going anywhere near
 * `strengthOfSchedule.ts`. Used to check the ranking against the fixtures
 * rather than against itself.
 */
const remainingOpponentStrength = (input: SosSeason): Map<number, number> => {
  const completedWeek = getCompletedWeek(input.league);
  const playoffWeekStart = getPlayoffWeekStart(input);
  if (completedWeek === null) return new Map();

  const scores = new Map<number, number[]>(
    input.rosters.map((r) => [r.roster_id, []])
  );
  Object.entries(input.matchups).forEach(([week, weekMatchups]) => {
    const w = parseInt(week);
    if (w > completedWeek || w >= playoffWeekStart) return;
    weekMatchups.forEach((m) => scores.get(m.roster_id)?.push(m.points));
  });

  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const opponentScores = new Map<number, number[]>(
    input.rosters.map((r) => [r.roster_id, []])
  );
  Object.entries(input.schedule ?? {}).forEach(([week, fixtures]) => {
    const w = parseInt(week);
    if (w <= completedWeek || w >= playoffWeekStart) return;
    fixtures.forEach((fixture) => {
      const opponent = fixtures.find(
        (f) =>
          f.matchup_id === fixture.matchup_id &&
          f.roster_id !== fixture.roster_id
      );
      if (!opponent) return;
      opponentScores
        .get(fixture.roster_id)
        ?.push(average(scores.get(opponent.roster_id) ?? []));
    });
  });

  return new Map(
    [...opponentScores.entries()].map(([rosterId, points]) => [
      rosterId,
      average(points),
    ])
  );
};

/**
 * Baseline snapshots for `calculateStrengthOfSchedule` (H1, updated by H7).
 *
 * This ranks the *remaining* schedule, so it returns `{}` for any season with
 * no regular season games left to play — every completed season, whether or
 * not its league still carries a `leg` setting. Only the in-progress season
 * produces real ranks, and it only produces them because `schedule.json` is
 * passed in: the unplayed fixtures are not in the matchup files.
 */
describe("calculateStrengthOfSchedule", () => {
  YEARS.forEach((year) => {
    it(`${year}`, () => {
      expect(calculateStrengthOfSchedule(sosInput(year))).toMatchSnapshot();
    });
  });

  it("returns {} when there are no matchups or rosters", () => {
    expect(calculateStrengthOfSchedule({} as unknown as SosSeason)).toEqual({});
  });

  it("returns {} for every completed season", () => {
    const completed = YEARS.filter((year) => year !== CURRENT_YEAR);
    expect(completed.length).toBeGreaterThan(0);

    completed.forEach((year) => {
      expect(calculateStrengthOfSchedule(sosInput(year))).toEqual({});
    });
  });

  it("ranks the live season by its remaining fixtures", () => {
    const input = sosInput(CURRENT_YEAR);
    const ranks = calculateStrengthOfSchedule(input);
    const strength = remainingOpponentStrength(input);

    // Independently derived from schedule.json + the played weeks: hardest
    // remaining average first, roster id as the tiebreak.
    const expectedOrder = [...strength.keys()].sort(
      (a, b) => strength.get(b)! - strength.get(a)! || a - b
    );
    const expected: Record<number, number> = {};
    expectedOrder.forEach((rosterId, index) => {
      expected[rosterId] = index + 1;
    });

    expect(ranks).toEqual(expected);

    // ...and that order is emphatically not the roster id order, which is what
    // the pre-H7 implementation produced.
    const rosterIds = input.rosters.map((r) => r.roster_id);
    expect(rosterIds.map((id) => ranks[id])).not.toEqual(rosterIds);
  });

  it("gives two teams with different remaining opponents different ranks", () => {
    const input = sosInput(CURRENT_YEAR);
    const ranks = calculateStrengthOfSchedule(input);
    const strength = remainingOpponentStrength(input);

    const byStrength = [...strength.entries()].sort((a, b) => b[1] - a[1]);
    const [hardestId, hardestAvg] = byStrength[0];
    const [easiestId, easiestAvg] = byStrength[byStrength.length - 1];

    // Sanity: the live season really does have teams facing different
    // opposition, so there is something for the ranking to distinguish.
    expect(hardestAvg).toBeGreaterThan(easiestAvg);

    expect(ranks[hardestId]).toBeLessThan(ranks[easiestId]);
    expect(ranks[hardestId]).toEqual(1);
    expect(ranks[easiestId]).toEqual(byStrength.length);
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
