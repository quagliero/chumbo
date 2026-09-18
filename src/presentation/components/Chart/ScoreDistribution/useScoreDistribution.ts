import { useMemo } from "react";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { CURRENT_YEAR, YEAR_NUMBERS } from "@/domain/constants";
import { useAllSeasons } from "@/hooks/useSeasonData";
import type { ExtendedMatchup } from "@/types/matchup";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  determineMatchupResult,
  roundToTwoDecimals,
} from "@/utils/recordUtils";
import { countedWeeks } from "../LuckChart/useLuckChart";
import { summarise, type ScoredWeek, type Spread } from "./histogram";

/**
 * Every manager's regular-season weekly scores, gathered for D4.
 *
 * WHICH GAMES ARE COUNTED, stated plainly because a distribution drawn over
 * the wrong set of weeks looks exactly like one drawn over the right set:
 *
 * - **Regular season only.** `countedWeeks` is D7's and D5's — weeks before
 *   `playoff_week_start`. In a playoff week half the league is playing
 *   consolation games and 2012-13 bracket only eight of ten teams, so a
 *   postseason score is not drawn from the same distribution as a September
 *   one. Every other all-play, luck and heatmap number on this site is
 *   regular-season only; a distribution that quietly included playoff weeks
 *   would disagree with the record shown beside it.
 * - **2026 is in, but only its finished weeks.** `countedWeeks` drops the
 *   unplayed ones, which sit in the data as twelve zeros and would otherwise
 *   add a phantom 0-point week to twelve distributions. As of writing that is
 *   one week, and the caption says so — one week cannot move a career mean but
 *   it is not nothing on a thirteen-week career.
 * - **2019 is in, uncaveated.** Its per-player breakdown is a reconstruction
 *   (`domain/dataQuality.ts`); its TEAM scores are correct, and team scores
 *   are the only thing this chart reads. Excluding it, or hedging it, would be
 *   dropping a real season for a reason that does not apply.
 * - **A week counts only if it was a real head-to-head game.** No opponent
 *   means a bye or a roster missing from the file: there is nothing to link
 *   to, and it would put the record and the distribution over different sets
 *   of games. That is the mistake D7 documents at length, and the record in
 *   each panel header is there precisely so a reader can compare two managers
 *   on the same W-L — so it has to be the record over exactly these weeks.
 *
 * Attribution follows the rest of the site: a season's games belong to the
 * roster's `owner_id` for the whole season, which is what the standings do.
 * All seventeen managers in `managers.json` resolve, including the four legacy
 * accounts that only appear in 2012-2019.
 */

export interface DistributionRow {
  managerId: string;
  name: string;
  /** Seasons they played at least one counted week in. */
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  /** Win rate over these weeks, a tie counting half. */
  winPct: number;
  /** Their scores, in the order played. */
  points: number[];
  spread: Spread;
  /** Their lowest and highest counted week, for the links out. */
  worst: ScoredWeek;
  best: ScoredWeek;
}

/**
 * `seasons[year].matchups` is keyed by week as a string and typed as a mapped
 * type over those keys, so a `number` cannot index it. Widened here once,
 * exactly as `useScoreHeatmap` does at its own boundary.
 */
type WeekMatchups = Record<string, ExtendedMatchup[] | undefined>;

interface Gathered {
  managerId: string;
  weeks: ScoredWeek[];
  wins: number;
  losses: number;
  ties: number;
  years: Set<number>;
}

export interface ScoreDistribution {
  rows: DistributionRow[];
  /** The league's own range and middle, so every panel shares one axis. */
  league: Spread;
  /** Seasons that contributed, for the caption. */
  years: number[];
  /** Counted weeks of the season in progress; 0 once it is over. */
  currentSeasonWeeks: number;
}

/** Walk the archive. Exported so the tests can check it against real seasons. */
export const buildScoreDistribution = (): ScoreDistribution => {
  const names = new Map(managers.map((manager) => [manager.id, manager.name]));
  const gathered = new Map<string, Gathered>();
  const years: number[] = [];

  for (const year of YEAR_NUMBERS) {
    const season = seasons[year];
    if (!season?.rosters?.length || !season?.matchups) continue;

    const weeks = countedWeeks(year);
    if (!weeks.length) continue;
    years.push(year);

    const byRoster = new Map(
      season.rosters.map((roster) => [roster.roster_id, roster])
    );

    for (const week of weeks) {
      const games = (season.matchups as WeekMatchups)[String(week)] ?? [];

      for (const game of games) {
        if (typeof game.matchup_id !== "number") continue;
        if (!Number.isFinite(game.points)) continue;

        const opponent = games.find(
          (other) =>
            other.matchup_id === game.matchup_id &&
            other.roster_id !== game.roster_id
        );
        if (!opponent) continue;

        const roster = byRoster.get(game.roster_id);
        const managerId =
          roster && getManagerIdBySleeperOwnerId(roster.owner_id);
        if (!managerId) continue;

        const points = roundToTwoDecimals(game.points);
        const result = determineMatchupResult(
          points,
          roundToTwoDecimals(opponent.points)
        );

        const row =
          gathered.get(managerId) ??
          ({
            managerId,
            weeks: [],
            wins: 0,
            losses: 0,
            ties: 0,
            years: new Set<number>(),
          } satisfies Gathered);

        row.weeks.push({ year, week, points, matchupId: game.matchup_id });
        if (result === "W") row.wins += 1;
        else if (result === "L") row.losses += 1;
        else row.ties += 1;
        row.years.add(year);
        gathered.set(managerId, row);
      }
    }
  }

  const rows: DistributionRow[] = [...gathered.values()].map((row) => {
    const points = row.weeks.map((week) => week.points);
    // Ties broken by the earlier week, so the link is stable rather than
    // depending on iteration order the day someone scores the same twice.
    const extreme = (best: boolean) =>
      row.weeks.reduce((held, week) =>
        best
          ? week.points > held.points
            ? week
            : held
          : week.points < held.points
          ? week
          : held
      );

    return {
      managerId: row.managerId,
      name: names.get(row.managerId) ?? row.managerId,
      seasons: row.years.size,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      winPct:
        (row.wins + row.ties * 0.5) / (row.wins + row.losses + row.ties || 1),
      points,
      spread: summarise(points),
      worst: extreme(false),
      best: extreme(true),
    };
  });

  return {
    // Widest swing first: "who is boom and bust" is the question the chart
    // exists to answer, and the component lets you re-rank from here.
    rows: rows.sort((a, b) => b.spread.sd - a.spread.sd),
    league: summarise(rows.flatMap((row) => row.points)),
    years,
    currentSeasonWeeks: countedWeeks(CURRENT_YEAR).length,
  };
};

/** The distributions, suspended until every season's matchups have loaded. */
export const useScoreDistribution = (): ScoreDistribution => {
  // Names no players, so it does not wait for the dictionary (A2b).
  useAllSeasons({ players: false });
  // Nothing below reads a prop or state, and once the hook returns at all the
  // seasons are loaded and will not change again for the life of the page.
  return useMemo(buildScoreDistribution, []);
};
