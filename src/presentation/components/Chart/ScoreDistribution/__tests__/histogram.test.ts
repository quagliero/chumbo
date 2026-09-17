import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { YEAR_NUMBERS } from "@/domain/constants";
import { countedWeeks } from "../../LuckChart/useLuckChart";
import {
  binFloors,
  binScores,
  quantile,
  summarise,
} from "../histogram";
import { buildScoreDistribution } from "../useScoreDistribution";

/**
 * The two ways a histogram lies without looking wrong: a week counted into the
 * wrong bin, and a spread computed over the wrong denominator. Both render as
 * a perfectly plausible picture, so they are tested here rather than eyeballed.
 */

describe("summarise", () => {
  it("describes a spread of scores", () => {
    const spread = summarise([80, 90, 100, 110, 120]);
    expect(spread.games).toBe(5);
    expect(spread.mean).toBe(100);
    expect(spread.median).toBe(100);
    expect(spread.min).toBe(80);
    expect(spread.max).toBe(120);
    expect(spread.q1).toBe(90);
    expect(spread.q3).toBe(110);
    // Population SD: sqrt(1000/5).
    expect(spread.sd).toBeCloseTo(Math.sqrt(200), 10);
  });

  it("reports no spread for a manager who scored the same every week", () => {
    // The metronome the chart exists to distinguish. Divided by n − 1 this
    // would still be 0, but a ONE-week career would be NaN, and NaN in a
    // scale paints nothing at all.
    const spread = summarise([95, 95, 95, 95]);
    expect(spread.sd).toBe(0);
    expect(spread.mean).toBe(95);
    expect(spread.median).toBe(95);
    expect(spread.q1).toBe(95);
    expect(spread.q3).toBe(95);
    expect(spread.min).toBe(95);
    expect(spread.max).toBe(95);
  });

  it("handles a single week without dividing by zero", () => {
    const spread = summarise([101.5]);
    expect(spread).toMatchObject({
      games: 1,
      mean: 101.5,
      sd: 0,
      median: 101.5,
      q1: 101.5,
      q3: 101.5,
      min: 101.5,
      max: 101.5,
    });
  });

  it("is empty rather than NaN for a manager with no counted weeks", () => {
    expect(summarise([])).toMatchObject({ games: 0, sd: 0, mean: 0 });
  });

  it("ignores non-finite scores rather than poisoning the mean", () => {
    expect(summarise([90, Number.NaN, 110]).games).toBe(2);
    expect(summarise([90, Number.NaN, 110]).mean).toBe(100);
  });

  it("does not sort the caller's array", () => {
    const points = [120, 80, 100];
    summarise(points);
    expect(points).toEqual([120, 80, 100]);
  });

  it("interpolates quartiles between neighbours", () => {
    // Fourteen weeks, one season — the shortest real career here. With n = 14
    // no quartile lands on an observation, so the interpolation is the whole
    // answer: q1 is at index 3.25 of the sorted list.
    const one = [
      59.56, 66.64, 74.18, 75.06, 76.2, 78.76, 92.88, 96, 100.56, 101.38,
      102.04, 105.28, 117.72, 126.88,
    ];
    const spread = summarise(one);
    expect(spread.games).toBe(14);
    expect(spread.q1).toBeCloseTo(75.06 + (76.2 - 75.06) * 0.25, 10);
    expect(spread.median).toBeCloseTo((92.88 + 96) / 2, 10);
    expect(spread.q3).toBeCloseTo(101.38 + (102.04 - 101.38) * 0.75, 10);
    expect(spread.mean).toBeCloseTo(1273.14 / 14, 10);
    expect(spread.sd).toBeCloseTo(19.0, 1);
  });
});

describe("quantile", () => {
  it("is the ends of the list at 0 and 1", () => {
    const sorted = [1, 2, 3, 4];
    expect(quantile(sorted, 0)).toBe(1);
    expect(quantile(sorted, 1)).toBe(4);
  });

  it("is 0 for an empty list rather than undefined", () => {
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("binFloors", () => {
  it("rounds out to whole bins containing both ends", () => {
    expect(binFloors(36.86, 174, 10)).toEqual([
      30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170,
    ]);
  });

  it("gives a value on a bin edge its own bin", () => {
    // 170 is a floor, not the top of the 160 bin: the max belongs in the bin
    // that contains it.
    expect(binFloors(30, 170, 10)).toContain(170);
    expect(binFloors(30, 169.9, 10)).not.toContain(170);
  });

  it("narrows with the bin width", () => {
    expect(binFloors(90, 104, 5)).toEqual([90, 95, 100]);
  });

  it("is empty for nonsense input rather than looping", () => {
    expect(binFloors(Number.NaN, 100, 10)).toEqual([]);
    expect(binFloors(0, 100, 0)).toEqual([]);
  });
});

describe("binScores", () => {
  const floors = binFloors(30, 174, 10);

  it("counts left-closed, right-open", () => {
    // 100.0 belongs to 100–110, not to 90–100. Getting this backwards moves
    // every round score one bin left and looks entirely normal on screen.
    const bins = binScores([99.99, 100, 100.01], floors, 10);
    expect(bins.find((bin) => bin.floor === 90)?.count).toBe(1);
    expect(bins.find((bin) => bin.floor === 100)?.count).toBe(2);
  });

  it("reports shares that sum to one", () => {
    const bins = binScores([44, 88, 91, 133, 133, 170], floors, 10);
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(6);
    expect(bins.reduce((total, bin) => total + bin.share, 0)).toBeCloseTo(1, 10);
  });

  it("makes a 13-week and a 190-week career comparable", () => {
    const short = binScores([95, 95, 95, 105], floors, 10);
    const long = binScores(
      [...Array(300).fill(95), ...Array(100).fill(105)],
      floors,
      10
    );
    expect(short.find((bin) => bin.floor === 90)?.share).toBe(0.75);
    expect(long.find((bin) => bin.floor === 90)?.share).toBe(0.75);
  });

  it("clamps a score outside the floors instead of dropping it", () => {
    // The floors come from the league's own range, so this should not happen —
    // but a dropped week would quietly stop the shares summing to one.
    const bins = binScores([10, 500], floors, 10);
    expect(bins[0].count).toBe(1);
    expect(bins[bins.length - 1].count).toBe(1);
    expect(bins.reduce((total, bin) => total + bin.share, 0)).toBeCloseTo(1, 10);
  });

  it("is all zeroes, not NaN, when a manager has no weeks", () => {
    const bins = binScores([], floors, 10);
    expect(bins.every((bin) => bin.count === 0 && bin.share === 0)).toBe(true);
  });
});

/**
 * The derivation against the real archive.
 *
 * Deliberately invariants rather than fixed totals: the 2026 season is being
 * played, so every manager's week count moves on a Tuesday. A test asserting
 * "jay has 190 weeks" would fail for the right reason and be edited away; these
 * fail only if the chart starts counting the wrong games.
 */
describe("buildScoreDistribution over the real archive", () => {
  const { rows, league, years, currentSeasonWeeks } = buildScoreDistribution();

  it("has every manager in managers.json", () => {
    expect(rows.map((row) => row.managerId).sort()).toEqual(
      managers.map((manager) => manager.id).sort()
    );
  });

  it("counts the record over exactly the weeks it plots", () => {
    // The D7 lesson: the moment the record and the distribution come from
    // different sets of games, comparing two managers on the same record
    // compares nothing.
    for (const row of rows) {
      expect(row.wins + row.losses + row.ties).toBe(row.spread.games);
      expect(row.points).toHaveLength(row.spread.games);
    }
  });

  it("counts every game from both sides", () => {
    // Every win is somebody's loss and every tie is somebody else's tie, so a
    // roster silently skipped — an unmapped owner, a missing opponent — shows
    // up here as an imbalance.
    const total = (pick: (row: (typeof rows)[number]) => number) =>
      rows.reduce((sum, row) => sum + pick(row), 0);
    expect(total((row) => row.wins)).toBe(total((row) => row.losses));
    expect(total((row) => row.ties) % 2).toBe(0);
    expect(total((row) => row.spread.games)).toBe(league.games);
    expect(league.games % 2).toBe(0);
  });

  it("plots only real scores", () => {
    // An unplayed or missing week sits in the data as a zero. One of those in a
    // distribution drags a mean down and puts a bar at the bottom of the axis
    // that looks like a genuine disaster.
    for (const row of rows) {
      for (const points of row.points) {
        expect(points).toBeGreaterThan(20);
        expect(points).toBeLessThan(250);
      }
    }
    expect(league.min).toBeGreaterThan(20);
  });

  it("stays inside the regular season, and inside finished weeks", () => {
    const allowed = new Map(
      years.map((year) => [year, new Set(countedWeeks(year))])
    );
    for (const row of rows) {
      for (const week of [row.worst, row.best]) {
        expect(allowed.get(week.year)?.has(week.week)).toBe(true);
      }
    }
    // The season in progress contributes its finished weeks and no more.
    const last = YEAR_NUMBERS[YEAR_NUMBERS.length - 1];
    expect(countedWeeks(last).length).toBe(currentSeasonWeeks);
  });

  it("includes 2019, whose team scores are sound", () => {
    // Only 2019's per-player breakdown is a reconstruction. Excluding the
    // season from a chart of TEAM scores would be dropping real data for a
    // reason that does not apply — so it is asserted, not left to habit.
    expect(years).toContain(2019);

    // And counted at full weight: every paired team-week of every counted week
    // of every season is in somebody's distribution, 2019 included. Recounted
    // from the season files rather than from the chart's own arithmetic.
    const paired = years.reduce((sum, year) => {
      const matchups = seasons[year]?.matchups as
        | Record<string, { matchup_id: number | null }[] | undefined>
        | undefined;
      return (
        sum +
        countedWeeks(year).reduce((weekly, week) => {
          const games = matchups?.[String(week)] ?? [];
          const paired = games.filter(
            (game) =>
              typeof game.matchup_id === "number" &&
              games.some(
                (other) =>
                  other !== game && other.matchup_id === game.matchup_id
              )
          );
          return weekly + paired.length;
        }, 0)
      );
    }, 0);

    expect(league.games).toBe(paired);
  });

  it("points worst and best at the weeks they claim", () => {
    for (const row of rows) {
      expect(row.worst.points).toBe(row.spread.min);
      expect(row.best.points).toBe(row.spread.max);
      expect(row.worst.matchupId).toBeGreaterThan(0);
      expect(row.best.matchupId).toBeGreaterThan(0);
    }
  });

  it("gives every panel a bin to draw", () => {
    const floors = binFloors(league.min, league.max, 10);
    for (const row of rows) {
      const bins = binScores(row.points, floors, 10);
      expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(
        row.spread.games
      );
    }
  });
});
