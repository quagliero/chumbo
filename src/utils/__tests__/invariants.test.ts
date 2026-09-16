import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { CURRENT_YEAR, YEARS } from "@/domain/constants";
import { ExtendedLeague } from "@/types/league";
import { ExtendedMatchup } from "@/types/matchup";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import { calculateStrengthOfSchedule } from "@/utils/strengthOfSchedule";
import { getOptimalLineup } from "@/utils/lineupAnalysis";
import { getManagerStats } from "@/utils/managerStats";
import { getCumulativeStandings } from "@/utils/standings";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { getRosterPointsFor } from "@/utils/recordUtils";
import { everyMatchup, round4, rostersFor, weeksFor } from "./helpers";

/**
 * Invariants that must hold however the stat helpers are refactored.
 *
 * Unlike the snapshot suites, these encode intent — a failure here is a bug or
 * a data problem, not a diff to eyeball. The ones that still fail on the data
 * as it stands today are marked `it.fails` with the details written out above
 * them. Do not relax them: if a refactor makes one start passing, `it.fails`
 * will go red, which is exactly the signal you want — at which point promote
 * it to a plain `it` and rewrite the comment as a "FIXED by" note.
 */

/**
 * Count the completed regular-season games a manager actually played in a
 * season, straight from the matchup data.
 */
const countRegularSeasonGames = (sleeperId: string, year: number): number => {
  const season = seasons[year];
  const roster = season?.rosters?.find((r) => r.owner_id === sleeperId);
  if (!roster || !season?.matchups) return 0;

  const playoffWeekStart = getPlayoffWeekStart(season);
  const matchups = season.matchups as unknown as Record<
    string,
    ExtendedMatchup[]
  >;

  let games = 0;
  weeksFor(year).forEach((week) => {
    if (week >= playoffWeekStart) return;
    if (!isWeekCompleted(week, season.league)) return;
    const weekMatchups = matchups[String(week)];
    if (!weekMatchups) return;
    const mine = weekMatchups.find((m) => m.roster_id === roster.roster_id);
    if (!mine) return;
    const opponent = weekMatchups.find(
      (m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id
    );
    if (opponent) games += 1;
  });
  return games;
};

describe("record invariants", () => {
  it("wins + losses + ties equals games actually played, per manager per season", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return;
      stats.seasonStats.forEach((season) => {
        const expected = countRegularSeasonGames(
          manager.sleeper.id,
          season.year
        );
        const actual = season.wins + season.losses + season.ties;
        if (actual !== expected) {
          violations.push(
            `${manager.id} ${season.year}: W${season.wins}-L${season.losses}-T${season.ties} = ${actual} games, but played ${expected}`
          );
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it("league-wide (all-play) games equal games played x other teams", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return;
      stats.seasonStats.forEach((season) => {
        const others = rostersFor(season.year).length - 1;
        const games = season.wins + season.losses + season.ties;
        const leagueGames =
          season.leagueWins + season.leagueLosses + season.leagueTies;
        if (leagueGames !== games * others) {
          violations.push(
            `${manager.id} ${season.year}: ${leagueGames} all-play games, expected ${games} x ${others} = ${
              games * others
            }`
          );
        }
      });
    });

    expect(violations).toEqual([]);
  });

  /**
   * KNOWN FAILURE — two sources of truth inside `getManagerStats`.
   *
   * In `"regular"` mode the running totals are taken from Sleeper's own
   * `roster.settings.wins/losses/ties` (managerStats.ts, the `dataMode ===
   * "regular"` branch) while `seasonStats[].wins` is recomputed from the
   * committed matchup JSON by `getSeasonStats`. The two disagree in 2019,
   * where Sleeper's stored record does not match the matchup scores that were
   * fetched (almost certainly post-hoc stat corrections that changed a result
   * after the roster record was frozen):
   *
   *   thd    2019 — matchups say 7-6, roster.settings says 8-5
   *   dix    2019 — matchups say 7-6, roster.settings says 8-5
   *   htc    2019 — matchups say 6-7, roster.settings says 4-9
   *
   * FIXED by the 2019 rebuild (scripts/rebuild-2019.js). Previously:
   *   thd  seasons sum 97-93  vs totals 98-92
   *   dix  seasons sum 112-78 vs totals 113-77
   *   htc  seasons sum 90-86  vs totals 88-88
   *
   * The two sources disagreed only because 2019's matchup JSON had been
   * overwritten with scores recomputed from an incomplete lineup. Both sides
   * now derive from the same NFL.com record, so this is a real invariant.
   */
  it("season records sum to the all-time totals", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return;
      const sum = stats.seasonStats.reduce(
        (acc, s) => ({
          wins: acc.wins + s.wins,
          losses: acc.losses + s.losses,
          ties: acc.ties + s.ties,
        }),
        { wins: 0, losses: 0, ties: 0 }
      );
      if (
        sum.wins !== stats.totalWins ||
        sum.losses !== stats.totalLosses ||
        sum.ties !== stats.totalTies
      ) {
        violations.push(
          `${manager.id}: seasons sum to ${sum.wins}-${sum.losses}-${sum.ties} but totals are ${stats.totalWins}-${stats.totalLosses}-${stats.totalTies}`
        );
      }
    });

    expect(violations).toEqual([]);
  });
});

describe("head-to-head invariants", () => {
  it("all-time H2H is symmetric between every pair of managers", () => {
    const violations: string[] = [];

    managers.forEach((a, i) => {
      managers.slice(i + 1).forEach((b) => {
        const forward = getAllTimeH2HRecord(a.sleeper.id, b.sleeper.id);
        const reverse = getAllTimeH2HRecord(b.sleeper.id, a.sleeper.id);

        if (
          forward.team1Wins !== reverse.team2Wins ||
          forward.team2Wins !== reverse.team1Wins ||
          forward.ties !== reverse.ties ||
          round4(forward.team1AvgPoints) !== round4(reverse.team2AvgPoints) ||
          round4(forward.team2AvgPoints) !== round4(reverse.team1AvgPoints)
        ) {
          violations.push(
            `${a.id} vs ${b.id}: ${JSON.stringify(forward)} is not the mirror of ${JSON.stringify(reverse)}`
          );
        }
      });
    });

    expect(violations).toEqual([]);
  });

  /**
   * FIXED alongside "season records sum to the all-time totals" above, and for
   * the same reason: `h2hRecords` comes from the matchup JSON and `totalWins`
   * from `roster.settings`, which disagreed only over the three 2019 records.
   */
  it("a manager's H2H wins across all opponents sum to their total wins", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return;
      const h2h = Object.values(stats.h2hRecords).reduce(
        (acc, r) => ({
          wins: acc.wins + r.wins,
          losses: acc.losses + r.losses,
          ties: acc.ties + r.ties,
        }),
        { wins: 0, losses: 0, ties: 0 }
      );
      if (
        h2h.wins !== stats.totalWins ||
        h2h.losses !== stats.totalLosses ||
        h2h.ties !== stats.totalTies
      ) {
        violations.push(
          `${manager.id}: H2H sums to ${h2h.wins}-${h2h.losses}-${h2h.ties} but totals are ${stats.totalWins}-${stats.totalLosses}-${stats.totalTies}`
        );
      }
    });

    expect(violations).toEqual([]);
  });
});

describe("lineup invariants", () => {
  /**
   * KNOWN FAILURE — `getOptimalLineup` can return LESS than the lineup the
   * manager actually started, which is arithmetically impossible: the started
   * lineup is one of the candidate lineups.
   *
   * 57 matchups are affected, all between 2012 and 2019. The cause is the
   * player dictionary, not the optimiser: `getOptimalLineup` resolves each
   * player's position from `src/data/players.json`, which is a *current*
   * Sleeper snapshot. Players who have since retired (or legacy string-named
   * entries from the pre-Sleeper seasons) resolve to `"UNK"`, so the optimiser
   * cannot fill the QB/RB/WR/TE/K/DEF slots they actually occupied and simply
   * leaves them out.
   *
   * Worst cases:
   *   2012 w4  roster 8  — actual 115.40, "optimal" 83.50  (-31.90)
   *   2012 w8  roster 8  — actual  84.68, "optimal" 54.68  (-30.00)
   *   2012 w3  roster 2  — actual  94.20, "optimal" 74.20  (-20.00)
   *   2012 w1  roster 2  — actual 125.44, "optimal" 107.92 (-17.52)
   *   2016 w13 roster 3  — actual 138.54, "optimal" 122.54 (-16.00)
   *
   * This is what BUILD_PLAN A1d (historical player overlays) exists to fix,
   * and it means every "points left on the bench" number for 2012-2019 is
   * currently understated or negative. The same check for 2020 onwards passes
   * — see the test below.
   */
  it.fails(
    "the optimal lineup never scores less than the lineup actually started",
    () => {
      const violations: string[] = [];

      everyMatchup().forEach(({ year, week, matchup }) => {
        if (!matchup.players?.length) return;
        const { optimalTotal, pointsLeftOnBench } = getOptimalLineup(
          matchup,
          year
        );
        if (round4(pointsLeftOnBench) < 0) {
          violations.push(
            `${year} w${week} roster ${matchup.roster_id}: actual ${matchup.points}, optimal ${round4(
              optimalTotal
            )}, deficit ${round4(pointsLeftOnBench)}`
          );
        }
      });

      expect(violations).toEqual([]);
    }
  );

  it("the optimal lineup never scores less than the actual lineup, 2020 onwards", () => {
    const violations: string[] = [];

    everyMatchup()
      .filter(({ year }) => year >= 2020)
      .forEach(({ year, week, matchup }) => {
        if (!matchup.players?.length) return;
        const { optimalTotal, pointsLeftOnBench } = getOptimalLineup(
          matchup,
          year
        );
        if (round4(pointsLeftOnBench) < 0) {
          violations.push(
            `${year} w${week} roster ${matchup.roster_id}: actual ${matchup.points}, optimal ${round4(
              optimalTotal
            )}`
          );
        }
      });

    expect(violations).toEqual([]);
  });
});

describe("draft invariants", () => {
  /**
   * A draft happens once a season, before a single game is played, so nothing
   * about it is a regular-season or a playoff fact.
   *
   * H11: it used to be. Draft picks were collected inside the weekly loop, so
   * a season contributed nothing unless one of its weeks passed the data-mode
   * filter — in "playoffs" mode a manager lost the entire draft for every year
   * they missed the playoffs. fin showed 175 drafted players in regular mode
   * and 28 in playoffs mode; kitch 194 and 57.
   */
  it("draft history is identical in every data mode", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const regular = getManagerStats(manager.id, "regular").mostDraftedPlayers;
      const playoffs = getManagerStats(manager.id, "playoffs")
        .mostDraftedPlayers;
      const combined = getManagerStats(manager.id, "combined")
        .mostDraftedPlayers;

      if (
        regular.length !== playoffs.length ||
        regular.length !== combined.length
      ) {
        violations.push(
          `${manager.id}: regular ${regular.length}, playoffs ${playoffs.length}, combined ${combined.length}`
        );
      }
    });

    expect(violations).toEqual([]);
  });
});

describe("strength of schedule invariants", () => {
  /**
   * The live season is the only season this is ever called for
   * (`Standings.tsx` guards on `currentYear >= YEARS[YEARS.length - 1]`), and
   * its ranking has to come from the fixtures still to be played.
   *
   * FIXED by H7. Previously `calculateStrengthOfSchedule` looked for *future*
   * weeks inside `seasonData.matchups`, but the fetch scripts only write a
   * `matchups/<week>.json` once that week has been played — 2026 held week 1
   * and nothing else. The unplayed fixtures live in `schedule.json`, which the
   * function never read, so the "remaining opponents" list was empty for every
   * team, every average was 0, and the ranking collapsed to `Object.entries`
   * order: roster 1 rank 1, roster 2 rank 2, and so on. The Standings column
   * was showing roster ids dressed up as a difficulty ranking.
   *
   * It now merges `schedule.json` over the played weeks, the same way
   * `PlayoffOdds` does (commits d7f96c4, 4ff1103), so the rank reflects the
   * opponents each team has left. Passing the schedule in is part of the
   * contract: without it there are no remaining fixtures to rank.
   */
  it("ranks the live season by something other than roster id", () => {
    const season = seasons[CURRENT_YEAR];
    const ranks = calculateStrengthOfSchedule({
      matchups: (season?.matchups ?? {}) as unknown as Record<
        string,
        ExtendedMatchup[]
      >,
      rosters: rostersFor(CURRENT_YEAR),
      league: season?.league as ExtendedLeague,
      schedule: season?.schedule,
    });

    const identity = rostersFor(CURRENT_YEAR).map((r) => r.roster_id);
    const produced = identity.map((id) => ranks[id]);

    expect(produced).not.toEqual(identity);
  });
});

describe("points reconciliation", () => {
  it("regular-season points-for matches between getManagerStats and the standings", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return;
      const row = getCumulativeStandings([...YEARS]).find(
        (s) => s.owner_id === manager.sleeper.id
      );
      if (!row) return;
      if (round4(stats.totalPointsFor) !== round4(row.points_for)) {
        violations.push(
          `${manager.id}: getManagerStats ${round4(stats.totalPointsFor)} vs standings ${round4(
            row.points_for
          )} (diff ${round4(stats.totalPointsFor - row.points_for)})`
        );
      }
    });

    expect(violations).toEqual([]);
  });

  /**
   * KNOWN FAILURE — the per-season `pointsFor` that `getManagerStats` derives
   * from the matchup JSON does not match the `roster.settings.fpts` total that
   * the standings (and the all-time table) display. Every 2019 roster is
   * affected, plus scattered rosters in 2021 and 2023:
   *
   *   2019 r8  (dix)  matchups 1326.20 vs roster 1364.99  (-38.79)
   *   2019 r10 (nick) matchups 1380.58 vs roster 1405.58  (-25.00)
   *   2019 r3  (jay)  matchups 1302.30 vs roster 1325.30  (-23.00)
   *   2019 r11 (rich) matchups 1212.84 vs roster 1202.84  (+10.00)
   *   2019 r4  (htc)  matchups 1161.06 vs roster 1149.36  (+11.70)
   *   ...all twelve 2019 rosters differ
   *   2021 r8  (dix)  matchups 1445.14 vs roster 1444.14  (+1.00)
   *   2023 r8  (dix)  matchups 1450.52 vs roster 1451.52  (-1.00)
   *
   * The 2019 matchup files are simply out of step with the season totals
   * Sleeper stored (post-hoc stat corrections). The site shows one number on
   * the standings and a different one on the manager page. Refetching 2019
   * would likely resolve most of it.
   */
  it.fails("matchup-derived season points-for matches the roster totals", () => {
    const violations: string[] = [];

    managers.forEach((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return;
      stats.seasonStats.forEach((season) => {
        const roster = seasons[season.year]?.rosters?.find(
          (r) => r.owner_id === manager.sleeper.id
        );
        if (!roster) return;
        if (round4(season.pointsFor) !== round4(getRosterPointsFor(roster))) {
          violations.push(
            `${manager.id} ${season.year}: matchups ${round4(season.pointsFor)} vs roster ${getRosterPointsFor(
              roster
            )}`
          );
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it("all-time standings equal the sum of the per-season standings", () => {
    const allTime = getCumulativeStandings([...YEARS]);
    const perYear = YEARS.map((year) => getCumulativeStandings([year]));
    const violations: string[] = [];

    allTime.forEach((row) => {
      const summed = perYear.reduce(
        (acc, year) => {
          const found = year.find((r) => r.owner_id === row.owner_id);
          if (!found) return acc;
          return {
            wins: acc.wins + found.wins,
            losses: acc.losses + found.losses,
            ties: acc.ties + found.ties,
            points_for: acc.points_for + found.points_for,
          };
        },
        { wins: 0, losses: 0, ties: 0, points_for: 0 }
      );

      if (
        summed.wins !== row.wins ||
        summed.losses !== row.losses ||
        summed.ties !== row.ties ||
        round4(summed.points_for) !== round4(row.points_for)
      ) {
        violations.push(
          `${row.team_name}: per-season sum ${summed.wins}-${summed.losses}-${summed.ties}/${round4(
            summed.points_for
          )} vs all-time ${row.wins}-${row.losses}-${row.ties}/${round4(row.points_for)}`
        );
      }
    });

    expect(violations).toEqual([]);
  });

  it("standings points-for match the raw roster settings", () => {
    const violations: string[] = [];

    YEARS.forEach((year) => {
      const standings = getCumulativeStandings([year]);
      rostersFor(year).forEach((roster) => {
        const row = standings.find((s) => s.owner_id === roster.owner_id);
        if (!row) return;
        if (round4(row.points_for) !== round4(getRosterPointsFor(roster))) {
          violations.push(
            `${year} roster ${roster.roster_id}: ${row.points_for} vs ${getRosterPointsFor(roster)}`
          );
        }
      });
    });

    expect(violations).toEqual([]);
  });
});
