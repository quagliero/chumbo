import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { seasonLuck } from "@/presentation/components/Chart/LuckChart/luck";
import { countedWeeks } from "@/presentation/components/Chart/LuckChart/useLuckChart";
import { calculateScheduleOdds } from "@/utils/playoffOdds";
import {
  normalCdf,
  poissonBinomial,
  scheduleLuck,
  winProbability,
} from "@/utils/scheduleLuck";
import { mergeScheduledFixtures } from "@/utils/scheduleUtils";
import { PINNED_THROUGH } from "./helpers";

/**
 * Schedule luck is a number the league will argue with, so its properties are
 * tested against every season rather than eyeballed: it agrees with D7, it
 * nets to zero, and the playoff simulation hands out exactly the playoff
 * places there are.
 */

describe("the pieces", () => {
  it("builds a distribution that sums to one, with the right mean", () => {
    const shares = [0.1, 0.9, 0.5, 0.25, 0.75, 1, 0];
    const distribution = poissonBinomial(shares);
    expect(distribution).toHaveLength(shares.length + 1);
    expect(distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const mean = distribution.reduce((sum, p, k) => sum + p * k, 0);
    expect(mean).toBeCloseTo(shares.reduce((a, b) => a + b, 0), 12);
  });

  it("prices a game so that one side or the other wins it", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    const a = { rosterId: 1, mean: 120, stdDev: 20 };
    const b = { rosterId: 2, mean: 105, stdDev: 25 };
    expect(winProbability(a, b) + winProbability(b, a)).toBeCloseTo(1, 7);
    expect(winProbability(a, b)).toBeGreaterThan(0.5);
  });
});

describe("every season", () => {
  for (const year of YEAR_NUMBERS) {
    const season = seasons[year];
    const weeks = countedWeeks(year);
    const luck = scheduleLuck(season.rosters, season.matchups, weeks);

    it(`${year}: agrees with D7's expected wins, and nets to zero`, () => {
      const d7 = new Map(
        seasonLuck(season.rosters, season.matchups, weeks).map((l) => [l.rosterId, l])
      );
      for (const team of luck) {
        expect(team.expectedWins).toBeCloseTo(d7.get(team.rosterId)!.expectedWins, 9);
        expect(team.actualWins).toBe(d7.get(team.rosterId)!.actualWins);
        expect(team.distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        expect(team.percentile).toBeGreaterThanOrEqual(0);
        expect(team.percentile).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(luck.reduce((sum, t) => sum + t.luck, 0))).toBeLessThan(1e-9);
    });
  }

  it.each(YEAR_NUMBERS.filter((y) => y <= PINNED_THROUGH))(
    "%i: hands out exactly the playoff places there are, three ways",
    (year) => {
      const season = seasons[year];
      const odds = calculateScheduleOdds(
        season,
        mergeScheduledFixtures(season.matchups, season.schedule),
        { simulations: 500, seed: year }
      );
      const places = (season.league.settings?.playoff_teams || 6) * 100;
      for (const key of ["actual", "neutralRest", "neutral"] as const) {
        expect(odds.reduce((sum, o) => sum + o[key], 0)).toBeCloseTo(places, 6);
      }
      // A finished regular season has nothing left to simulate: the real
      // schedule gives the same answer every time.
      for (const o of odds) {
        expect([0, 100]).toContain(o.actual);
        expect(o.neutralRest).toBe(o.actual);
      }
    }
  );
});
