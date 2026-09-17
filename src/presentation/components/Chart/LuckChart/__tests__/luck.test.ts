import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { seasonLuck, weeklyExpectedWins } from "../luck";
import { countedWeeks } from "../useLuckChart";

/**
 * D7 is the one chart on the list whose number is contested by design — the
 * league is meant to argue about it — so the derivation is tested rather than
 * eyeballed. A luck score that is subtly wrong is worse than no chart.
 */

/** Only the four fields the derivation reads; the rest is scoring detail. */
const game = (
  rosterId: number,
  matchupId: number,
  points: number
): ExtendedMatchup =>
  ({ roster_id: rosterId, matchup_id: matchupId, points } as ExtendedMatchup);

const roster = (rosterId: number): ExtendedRoster =>
  ({ roster_id: rosterId, owner_id: `owner-${rosterId}` } as ExtendedRoster);

/** Four rosters, paired 1v2 and 3v4 every week. */
const FOUR = [roster(1), roster(2), roster(3), roster(4)];

const week = (scores: [number, number, number, number]): ExtendedMatchup[] => [
  game(1, 1, scores[0]),
  game(2, 1, scores[1]),
  game(3, 2, scores[2]),
  game(4, 2, scores[3]),
];

const totalsFor = (rows: ReturnType<typeof seasonLuck>, rosterId: number) =>
  rows.find((row) => row.rosterId === rosterId)!;

describe("weeklyExpectedWins", () => {
  it("gives a whole win to the week's top score", () => {
    expect(weeklyExpectedWins({ wins: 11, losses: 0, ties: 0 })).toBe(1);
  });

  it("gives nothing to the week's worst score", () => {
    expect(weeklyExpectedWins({ wins: 0, losses: 11, ties: 0 })).toBe(0);
  });

  it("counts a tied score as half a win", () => {
    // Beat nine, tied one, lost one: 9.5 of eleven.
    expect(weeklyExpectedWins({ wins: 9, losses: 1, ties: 1 })).toBeCloseTo(
      9.5 / 11,
      12
    );
  });

  it("is a share of a win, so a ten-team week is worth the same as a twelve", () => {
    // Middle of the field in 2012 and in 2025 must be worth the same, or
    // careers spanning both are measured on two different axes.
    expect(weeklyExpectedWins({ wins: 5, losses: 4, ties: 0 })).toBeCloseTo(
      5 / 9,
      12
    );
    expect(weeklyExpectedWins({ wins: 6, losses: 5, ties: 0 })).toBeCloseTo(
      6 / 11,
      12
    );
  });

  it("is zero rather than NaN when nobody else played", () => {
    expect(weeklyExpectedWins({ wins: 0, losses: 0, ties: 0 })).toBe(0);
  });
});

describe("seasonLuck", () => {
  const matchups = {
    "1": week([100, 90, 80, 70]),
    "2": week([100, 90, 80, 70]),
    "3": week([100, 90, 80, 70]),
  };
  const rows = seasonLuck(FOUR, matchups, [1, 2, 3]);

  it("gives the top scorer every actual and every expected win", () => {
    const best = totalsFor(rows, 1);
    expect(best).toMatchObject({ games: 3, wins: 3, losses: 0, ties: 0 });
    expect(best.actualWins).toBe(3);
    expect(best.expectedWins).toBeCloseTo(3, 12);
    expect(best.actualWins - best.expectedWins).toBeCloseTo(0, 12);
  });

  it("gives the bottom scorer neither", () => {
    const worst = totalsFor(rows, 4);
    expect(worst).toMatchObject({ games: 3, wins: 0, losses: 3, ties: 0 });
    expect(worst.actualWins).toBe(0);
    expect(worst.expectedWins).toBeCloseTo(0, 12);
  });

  it("separates the third-best team that keeps drawing the worst one", () => {
    // Roster 3 loses to nobody but roster 1 and 2, whom it never plays. It
    // beats one of three every week, so it deserved 1.0 wins and got 3 — the
    // exact complaint the chart exists to make visible.
    const lucky = totalsFor(rows, 3);
    expect(lucky.actualWins).toBe(3);
    expect(lucky.expectedWins).toBeCloseTo(1, 12);
    expect(lucky.actualWins - lucky.expectedWins).toBeCloseTo(2, 12);

    // And roster 2, who out-scored roster 3 every week, got nothing for it.
    const unlucky = totalsFor(rows, 2);
    expect(unlucky.actualWins).toBe(0);
    expect(unlucky.expectedWins).toBeCloseTo(2, 12);
  });

  it("splits a tie down the middle on both sides of the comparison", () => {
    const tied = seasonLuck(FOUR, { "1": week([90, 90, 80, 70]) }, [1]);
    const a = totalsFor(tied, 1);
    const b = totalsFor(tied, 2);

    expect(a).toMatchObject({ wins: 0, losses: 0, ties: 1 });
    expect(a.actualWins).toBe(0.5);
    // Beat two, tied one: (2 + 0.5) / 3.
    expect(a.expectedWins).toBeCloseTo(2.5 / 3, 12);
    expect(b.actualWins).toBe(0.5);
    expect(b.expectedWins).toBeCloseTo(2.5 / 3, 12);
  });

  it("compares at Sleeper's two decimals, not at float precision", () => {
    // 0.1 + 0.2 is 0.30000000000000004. Rounded, these two tied.
    const rounded = seasonLuck(FOUR, { "1": week([0.1 + 0.2, 0.3, 0, 0]) }, [1]);
    expect(totalsFor(rounded, 1).ties).toBe(1);
  });

  it("counts only the weeks it is given", () => {
    const one = seasonLuck(FOUR, matchups, [2]);
    expect(totalsFor(one, 1).games).toBe(1);
  });

  it("skips a week a roster has no opponent in", () => {
    // Expected wins must accrue over exactly the games actual wins accrue
    // over, or the difference stops being luck.
    const bye = seasonLuck(FOUR, { "1": [game(1, 1, 100), game(2, 2, 90)] }, [1]);
    expect(totalsFor(bye, 1).games).toBe(0);
    expect(totalsFor(bye, 1).expectedWins).toBe(0);
  });

  it("conserves: the league's expected wins equal its actual wins", () => {
    const expected = rows.reduce((sum, row) => sum + row.expectedWins, 0);
    const actual = rows.reduce((sum, row) => sum + row.actualWins, 0);
    const games = rows.reduce((sum, row) => sum + row.games, 0);

    expect(actual).toBe(games / 2);
    expect(expected).toBeCloseTo(games / 2, 12);
  });
});

describe("the real archive", () => {
  /**
   * The invariant that makes the chart honest: in a week where every roster is
   * paired, the all-play comparisons total C(n,2), so the league's expected
   * wins total n/2 — exactly the n/2 wins the schedule handed out that week.
   * Luck is therefore zero-sum, and every win above the diagonal was taken off
   * somebody below it.
   *
   * It is also the canary for a malformed season: a week with an unpaired
   * roster, a duplicated `matchup_id` or a roster missing from the file breaks
   * this and nothing else on the site would notice.
   */
  it.each(YEAR_NUMBERS.filter((year) => countedWeeks(year).length > 0))(
    "%i: expected wins equal actual wins, and both equal games / 2",
    (year) => {
      const season = seasons[year];
      const rows = seasonLuck(
        season.rosters,
        season.matchups,
        countedWeeks(year)
      );

      const expected = rows.reduce((sum, row) => sum + row.expectedWins, 0);
      const actual = rows.reduce((sum, row) => sum + row.actualWins, 0);
      const games = rows.reduce((sum, row) => sum + row.games, 0);

      expect(games).toBeGreaterThan(0);
      expect(actual).toBe(games / 2);
      expect(expected).toBeCloseTo(games / 2, 9);
    }
  );

  it("agrees with the standings on the actual record", () => {
    // Sleeper's own regular-season W-L-T, carried on the roster and rendered by
    // the standings page. Every season in the archive agrees with it, 2019's
    // rebuild included, so any drift here means the chart is plotting a
    // different season to the rest of the site.
    for (const year of YEAR_NUMBERS.filter(
      (y) => countedWeeks(y).length > 0
    )) {
      const season = seasons[year];
      const rows = seasonLuck(
        season.rosters,
        season.matchups,
        countedWeeks(year)
      );

      for (const roster of season.rosters) {
        const row = rows.find((r) => r.rosterId === roster.roster_id)!;
        expect({ year, ...pick(row) }).toEqual({
          year,
          wins: roster.settings.wins,
          losses: roster.settings.losses,
          ties: roster.settings.ties,
        });
      }
    }
  });

  /**
   * Two hand-worked seasons, checked week by week against the matchup files
   * (see the D7 report). They are fixed history, so these numbers can only
   * change if the derivation does.
   */
  it("reproduces 2023 rich: 11-3 on a 7.3-win season", () => {
    const rows = seasonLuck(
      seasons[2023].rosters,
      seasons[2023].matchups,
      countedWeeks(2023)
    );
    const rich = totalsFor(rows, 11);

    expect(rich).toMatchObject({ games: 14, wins: 11, losses: 3, ties: 0 });
    expect(rich.actualWins).toBe(11);
    expect(rich.expectedWins).toBeCloseTo(7.2727, 3);
  });

  it("reproduces 2018 jay: 12-1 on a 9.4-win season", () => {
    const rows = seasonLuck(
      seasons[2018].rosters,
      seasons[2018].matchups,
      countedWeeks(2018)
    );
    const jay = totalsFor(rows, 2);

    expect(jay).toMatchObject({ games: 13, wins: 12, losses: 1, ties: 0 });
    expect(jay.actualWins).toBe(12);
    // Week 4 of that season includes a tied score, so this is not a whole
    // number of elevenths.
    expect(jay.expectedWins).toBeCloseTo(9.4091, 3);
  });

  it("excludes playoff weeks", () => {
    // 2023's playoffs start in week 15, so no manager can have played more
    // than fourteen counted games.
    expect(countedWeeks(2023)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it("counts only finished weeks of the season being played", () => {
    const current = YEAR_NUMBERS[YEAR_NUMBERS.length - 1];
    const league = seasons[current].league;
    const scored = league?.settings?.last_scored_leg;

    // An in-progress season has a `leg`; a finished one does not, and then
    // every regular-season week counts.
    if (scored !== undefined) {
      expect(Math.max(0, ...countedWeeks(current))).toBeLessThanOrEqual(scored);
    }
  });
});

const pick = ({
  wins,
  losses,
  ties,
}: {
  wins: number;
  losses: number;
  ties: number;
}) => ({ wins, losses, ties });
