import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { CURRENT_YEAR, YEAR_NUMBERS } from "@/domain/constants";
import { ExtendedLeague } from "@/types/league";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { arcWeeks, byStanding, seasonArc, type ArcPoint } from "../arc";

/**
 * D1's whole claim is that the shape of the line is the shape of the season, so
 * the running totals have to be right at every week rather than only at the
 * end. The two things that would silently break it are a cumulative total that
 * drifts, and the in-progress season contributing weeks that were never played
 * — both are asserted here against the real archive as well as against
 * fixtures.
 */

/** Only the three fields the derivation reads. */
const game = (
  rosterId: number,
  matchupId: number,
  points: number
): ExtendedMatchup =>
  ({ roster_id: rosterId, matchup_id: matchupId, points } as ExtendedMatchup);

const roster = (rosterId: number): ExtendedRoster =>
  ({ roster_id: rosterId, owner_id: `owner-${rosterId}` } as ExtendedRoster);

/** Four rosters, paired 1v2 and 3v4. */
const FOUR = [roster(1), roster(2), roster(3), roster(4)];

const week = (scores: [number, number, number, number]): ExtendedMatchup[] => [
  game(1, 1, scores[0]),
  game(2, 1, scores[1]),
  game(3, 2, scores[2]),
  game(4, 2, scores[3]),
];

const league = (settings: Record<string, number>): ExtendedLeague =>
  ({ settings } as unknown as ExtendedLeague);

const rowFor = (rows: ReturnType<typeof seasonArc>, rosterId: number) =>
  rows.find((row) => row.rosterId === rosterId)!;

const played = (points: (ArcPoint | null)[]) =>
  points.filter((point): point is ArcPoint => point !== null);

describe("seasonArc", () => {
  const matchups = {
    "1": week([100, 90, 80, 70]),
    "2": week([100, 90, 80, 70]),
    "3": week([100, 90, 80, 70]),
  };
  const rows = seasonArc(FOUR, matchups, [1, 2, 3]);

  it("accumulates a win a week for the manager who wins every week", () => {
    const best = rowFor(rows, 1);
    expect(played(best.points).map((p) => p.wins)).toEqual([1, 2, 3]);
    expect(best.totalWins).toBe(3);
    expect(best).toMatchObject({ games: 3, wins: 3, losses: 0, ties: 0 });
  });

  it("accumulates points for regardless of the result", () => {
    const worst = rowFor(rows, 4);
    expect(played(worst.points).map((p) => p.points)).toEqual([70, 140, 210]);
    expect(worst.totalPoints).toBe(210);
  });

  /**
   * The case the brief names: a season where someone lost every single game.
   * The wins line has to be flat at zero for all thirteen weeks — not absent,
   * not starting at one — while the points line keeps climbing, which is the
   * whole reason both metrics are offered.
   */
  it("draws an 0-13 season as a flat line at zero, not as a gap", () => {
    const thirteen = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [
        String(i + 1),
        week([100, 90, 80, 70]),
      ])
    );
    const winless = rowFor(seasonArc(FOUR, thirteen, range(1, 13)), 4);

    expect(winless).toMatchObject({ games: 13, wins: 0, losses: 13, ties: 0 });
    expect(winless.points).toHaveLength(13);
    expect(winless.points.every((point) => point !== null)).toBe(true);
    expect(played(winless.points).map((p) => p.wins)).toEqual(
      Array(13).fill(0)
    );
    // Still scored 910 points while going 0-13.
    expect(winless.totalPoints).toBe(910);
    expect(played(winless.points).map((p) => p.points)).toEqual(
      range(1, 13).map((n) => n * 70)
    );
  });

  it("counts a tie as half a win, on the same weeks as the record", () => {
    const tied = seasonArc(FOUR, { "1": week([90, 90, 80, 70]) }, [1]);
    expect(rowFor(tied, 1)).toMatchObject({ wins: 0, losses: 0, ties: 1 });
    expect(rowFor(tied, 1).totalWins).toBe(0.5);
    expect(rowFor(tied, 2).totalWins).toBe(0.5);
  });

  it("compares at Sleeper's two decimals, not at float precision", () => {
    // 0.1 + 0.2 is 0.30000000000000004. Rounded, these two tied.
    const rounded = seasonArc(FOUR, { "1": week([0.1 + 0.2, 0.3, 0, 0]) }, [1]);
    expect(rowFor(rounded, 1).ties).toBe(1);
  });

  it("carries the totals across a week with no opponent, but leaves a gap", () => {
    // A gap, not a zero: `linePath` lifts the pen, so the chart never draws a
    // segment through a week that was not played.
    const bye = {
      "1": week([100, 90, 80, 70]),
      "2": [game(1, 1, 50), game(3, 2, 80), game(4, 2, 70)],
      "3": week([100, 90, 80, 70]),
    };
    const row = rowFor(seasonArc(FOUR, bye, [1, 2, 3]), 1);

    expect(row.points[1]).toBeNull();
    expect(row.games).toBe(2);
    // Week 3's running totals pick up exactly where week 1 left off.
    expect(row.points[2]).toMatchObject({ wins: 2, points: 200 });
  });

  it("counts only the weeks it is given", () => {
    expect(rowFor(seasonArc(FOUR, matchups, [2]), 1).games).toBe(1);
  });

  it("orders the legend by wins, then points — the standings sort", () => {
    const ordered = [...rows].sort(byStanding).map((row) => row.rosterId);
    expect(ordered).toEqual([1, 3, 2, 4]);
  });
});

describe("arcWeeks", () => {
  const finished = league({ playoff_week_start: 15 });

  it("stops at the last regular season week", () => {
    const matchups = Object.fromEntries(
      range(1, 17).map((n) => [String(n), week([100, 90, 80, 70])])
    );
    expect(arcWeeks(matchups, finished)).toEqual(range(1, 14));
  });

  /**
   * THE constraint on the in-progress season. Weeks 2 and 3 are in the file as
   * zeros — either not played, or fetched mid-week. Drawn as-is they would read
   * as the entire league collapsing in the same week, and the 0-0 pairings
   * would hand out four fictional half-wins.
   */
  it("stops at the last completed week of the season being played", () => {
    const live = league({ playoff_week_start: 15, leg: 3, last_scored_leg: 1 });
    const matchups = {
      "1": week([100, 90, 80, 70]),
      "2": week([0, 0, 0, 0]),
      "3": week([0, 0, 0, 0]),
    };

    expect(arcWeeks(matchups, live)).toEqual([1]);

    const rows = seasonArc(FOUR, matchups, arcWeeks(matchups, live));
    expect(rows.every((row) => row.games === 1)).toBe(true);
    // Nobody is credited with a win they have not played for.
    expect(rows.reduce((sum, row) => sum + row.totalWins, 0)).toBe(2);
  });

  it("drops an all-zero week even when the league claims it was scored", () => {
    // `leg` can run ahead of reality while a week is being fetched. The second
    // gate catches what the first misses.
    const live = league({ playoff_week_start: 15, leg: 3, last_scored_leg: 2 });
    expect(
      arcWeeks({ "1": week([100, 90, 80, 70]), "2": week([0, 0, 0, 0]) }, live)
    ).toEqual([1]);
  });

  it("is empty before a ball is kicked", () => {
    const preseason = league({ playoff_week_start: 15, leg: 1 });
    expect(arcWeeks({ "1": week([0, 0, 0, 0]) }, preseason)).toEqual([]);
    expect(arcWeeks({}, preseason)).toEqual([]);
  });

  it("treats a season with no `leg` as finished, so every week counts", () => {
    // 2012 and 2013 have no `leg` at all; nothing in them is provisional.
    const matchups = Object.fromEntries(
      range(1, 14).map((n) => [String(n), week([100, 90, 80, 70])])
    );
    expect(arcWeeks(matchups, finished)).toEqual(range(1, 14));
  });
});

describe("the real archive", () => {
  const drawn = YEAR_NUMBERS.filter(
    (year) => arcWeeks(seasons[year]?.matchups ?? {}, seasons[year]?.league).length > 0
  );

  it.each(drawn)("%i: the running totals never go down", (year) => {
    const season = seasons[year];
    const weeks = arcWeeks(season.matchups, season.league);

    for (const row of seasonArc(season.rosters, season.matchups, weeks)) {
      let wins = 0;
      let points = 0;
      for (const point of played(row.points)) {
        expect(point.wins).toBeGreaterThanOrEqual(wins);
        expect(point.points).toBeGreaterThanOrEqual(points);
        // A week is worth at most one win, and exactly one game.
        expect(point.wins - wins).toBeLessThanOrEqual(1);
        wins = point.wins;
        points = point.points;
      }
      expect(wins).toBe(row.totalWins);
      expect(points).toBe(row.totalPoints);
    }
  });

  it("agrees with the standings on every completed season's record", () => {
    // Sleeper's own regular-season W-L-T, carried on the roster and rendered by
    // the table this chart sits above. If they ever disagree, the arc is
    // drawing a different season to the page around it.
    for (const year of drawn) {
      if (year === CURRENT_YEAR) continue; // still being played, so still moving
      const season = seasons[year];
      const rows = seasonArc(
        season.rosters,
        season.matchups,
        arcWeeks(season.matchups, season.league)
      );

      for (const roster of season.rosters) {
        const row = rowFor(rows, roster.roster_id);
        expect({ year, ...pick(row) }).toEqual({
          year,
          wins: roster.settings.wins,
          losses: roster.settings.losses,
          ties: roster.settings.ties,
        });
      }
    }
  });

  it("stops the season being played at its last completed week", () => {
    const season = seasons[CURRENT_YEAR];
    const scored = season?.league?.settings?.last_scored_leg;
    const weeks = arcWeeks(season?.matchups ?? {}, season?.league);

    // An in-progress season has a `leg`; a finished one does not, and then
    // every regular-season week counts.
    if (scored !== undefined) {
      expect(Math.max(0, ...weeks)).toBeLessThanOrEqual(scored);
    }
  });
});

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const pick = ({
  wins,
  losses,
  ties,
}: {
  wins: number;
  losses: number;
  ties: number;
}) => ({ wins, losses, ties });
