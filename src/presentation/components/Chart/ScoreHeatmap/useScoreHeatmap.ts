import { useMemo } from "react";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { YEAR_NUMBERS } from "@/domain/constants";
import { hasIncompleteBench } from "@/domain/dataQuality";
import { useAllSeasons } from "@/hooks/useSeasonData";
import type { ExtendedMatchup } from "@/types/matchup";
import type { ExtendedRoster } from "@/types/roster";
import { memoiseOverSeasons } from "@/utils/cache";
import {
  determineMatchupResult,
  roundToTwoDecimals,
} from "@/utils/recordUtils";
import { getManagerNameBySleeperOwnerId } from "@/utils/managerUtils";
import { countedWeeks } from "../LuckChart/useLuckChart";
import { bandFloors } from "./scoreScale";

/**
 * One manager's weekly scores, season by season (D5).
 *
 * The grid is REGULAR SEASON ONLY, and that is a decision rather than an
 * oversight. Three reasons, in order of how much they matter:
 *
 *   1. In a playoff week half the league is playing consolation games and a bye
 *      sits in the data as a matchup with `matchup_id: null`. A cell with no
 *      matchup behind it cannot link anywhere, and the rule for workstream D is
 *      that a chart is never a dead end.
 *   2. 2012 and 2013 bracket only eight of ten teams, so those weeks would be
 *      holes in the grid for two managers a year, for reasons that have nothing
 *      to do with how they played.
 *   3. Every other all-play, luck and record number on this site is regular
 *      season only. A heatmap that quietly included playoff weeks would
 *      disagree with the season table beside it.
 *
 * The postseason is not lost — it is what the career timeline above this chart
 * is for, where a title is a trophy rather than one more dark blue square.
 *
 * `countedWeeks` is D7's, reused deliberately rather than re-derived. It
 * already answers "which weeks of this season count", including the subtle half
 * of that: for the season being played, only weeks that have actually finished,
 * because an unplayed week sits in the data as twelve zeros and would otherwise
 * paint a row of ice-cold cells for games nobody has played yet.
 */

export interface HeatmapCell {
  year: number;
  week: number;
  /** Their score, at Sleeper's own two-decimal precision. */
  points: number;
  opponentPoints: number;
  opponentName: string;
  result: "W" | "L" | "T";
  /** Links to `/seasons/:year/matchups/:week/:matchupId`. */
  matchupId: number;
  /** Where the score ranked in the league that week, 1 = highest. */
  rank: number;
  /** How many teams played that week — the denominator for `rank`. */
  field: number;
}

export interface HeatmapRow {
  year: number;
  /** One slot per week in `weeks`; `null` where there was no game. */
  cells: (HeatmapCell | null)[];
  /** Weeks actually played. */
  played: number;
  /** Mean score over those weeks. */
  average: number;
  best: HeatmapCell;
  worst: HeatmapCell;
  /**
   * True where the season's per-player data is a reconstruction
   * (`domain/dataQuality.ts`). Team scores — all this chart draws — are correct
   * for those seasons, so the row is drawn normally; the flag exists so the
   * caption can say so rather than leaving a reader who knows about 2019 to
   * wonder whether these squares are guesses too.
   */
  approximateLineups: boolean;
}

export interface ScoreHeatmap {
  /** Week numbers along the top, ascending. Empty if they never played. */
  weeks: number[];
  /** One row per season played, oldest first. */
  rows: HeatmapRow[];
  /** Band floors for the colour scale — league-wide, not per manager. */
  floors: number[];
  /** Their best and worst regular-season week ever. */
  best: HeatmapCell | null;
  worst: HeatmapCell | null;
}

/**
 * One week's games.
 *
 * `seasons[year].matchups` is keyed by week as a STRING, and typed as a mapped
 * type over those keys rather than as an index signature, so a `number` cannot
 * index it. `luck.ts` widens it at its own boundary for the same reason; this
 * does it in one place instead of at three call sites.
 */
type WeekMatchups = Record<string, ExtendedMatchup[] | undefined>;

const gamesIn = (matchups: WeekMatchups, week: number): ExtendedMatchup[] =>
  matchups[String(week)] ?? [];

/**
 * The colour scale's band floors, from every regular-season team-week in league
 * history.
 *
 * Memoised because it is the same answer for every manager and this walks all
 * fifteen seasons to get it; without the cache, opening four manager pages
 * would walk them four times for an identical array of seven numbers.
 */
export const leagueBandFloors = memoiseOverSeasons(
  "scoreHeatmapFloors",
  (): number[] => {
    const scores: number[] = [];
    for (const year of YEAR_NUMBERS) {
      const season = seasons[year];
      if (!season?.matchups) continue;
      for (const week of countedWeeks(year)) {
        for (const game of gamesIn(season.matchups, week)) {
          if (Number.isFinite(game.points)) scores.push(game.points);
        }
      }
    }
    return bandFloors(scores);
  },
  1
);

/** One season's games for one roster, keyed by week. */
const seasonCells = (
  year: number,
  roster: ExtendedRoster
): Map<number, HeatmapCell> => {
  const season = seasons[year];
  const rosters = season.rosters as ExtendedRoster[];
  const cells = new Map<number, HeatmapCell>();

  for (const week of countedWeeks(year)) {
    const games = gamesIn(season.matchups, week);
    const mine = games.find((game) => game.roster_id === roster.roster_id);
    if (!mine || typeof mine.matchup_id !== "number") continue;

    const opponent = games.find(
      (game) =>
        game.matchup_id === mine.matchup_id && game.roster_id !== mine.roster_id
    );
    // No opponent means no game — a bye, or a roster missing from the file.
    // Nothing to link to and no result to report, so no cell.
    if (!opponent) continue;

    const points = roundToTwoDecimals(mine.points);
    const opponentPoints = roundToTwoDecimals(opponent.points);

    // Rank is against everyone who played that week, not just the opponent:
    // "third highest score in the league" is the claim people actually make,
    // and it is what the colour of the cell is a picture of.
    const scores = games
      .map((game) => roundToTwoDecimals(game.points))
      .filter((value) => Number.isFinite(value));

    const opponentRoster = rosters.find(
      (r) => r.roster_id === opponent.roster_id
    );

    cells.set(week, {
      year,
      week,
      points,
      opponentPoints,
      opponentName:
        (opponentRoster &&
          getManagerNameBySleeperOwnerId(opponentRoster.owner_id)) ||
        "Unknown",
      result: determineMatchupResult(points, opponentPoints),
      matchupId: mine.matchup_id,
      rank: scores.filter((value) => value > points).length + 1,
      field: scores.length,
    });
  }

  return cells;
};

/**
 * Build one manager's grid.
 *
 * Exported for the tests, which assert the two ways this can be silently wrong:
 * a cell landing in the wrong week's column, and a rank computed against the
 * wrong field. Both look like perfectly plausible data on screen.
 */
export const buildScoreHeatmap = (managerId: string): ScoreHeatmap => {
  const floors = leagueBandFloors();
  const manager = managers.find((m) => m.id === managerId);
  if (!manager) return { weeks: [], rows: [], floors, best: null, worst: null };

  const byYear: { year: number; cells: Map<number, HeatmapCell> }[] = [];

  for (const year of YEAR_NUMBERS) {
    const season = seasons[year];
    if (!season?.rosters?.length || !season?.matchups) continue;

    const roster = (season.rosters as ExtendedRoster[]).find(
      (r) => r.owner_id === manager.sleeper.id
    );
    if (!roster) continue;

    const cells = seasonCells(year, roster);
    if (cells.size > 0) byYear.push({ year, cells });
  }

  // Every row is the same length, or the columns would not line up. The grid is
  // as wide as the longest regular season anyone in it played: 2012-13 and
  // 2021+ run to fourteen weeks, 2014-2020 to thirteen, so a career spanning
  // the change has a ragged right edge — which is the truth about it.
  const widest = Math.max(
    0,
    ...byYear.flatMap(({ cells }) => [...cells.keys()])
  );
  const weeks = Array.from({ length: widest }, (_, index) => index + 1);

  const rows: HeatmapRow[] = byYear.map(({ year, cells }) => {
    const played = [...cells.values()];
    return {
      year,
      cells: weeks.map((week) => cells.get(week) ?? null),
      played: played.length,
      average:
        played.reduce((total, cell) => total + cell.points, 0) / played.length,
      best: played.reduce((a, b) => (b.points > a.points ? b : a)),
      worst: played.reduce((a, b) => (b.points < a.points ? b : a)),
      approximateLineups: hasIncompleteBench(year),
    };
  });

  const bests = rows.map((row) => row.best);
  const worsts = rows.map((row) => row.worst);

  return {
    weeks,
    rows,
    floors,
    best: bests.length ? bests.reduce((a, b) => (b.points > a.points ? b : a)) : null,
    worst: worsts.length
      ? worsts.reduce((a, b) => (b.points < a.points ? b : a))
      : null,
  };
};

/** The grid, suspended until every season's matchups have loaded (A2a). */
export const useScoreHeatmap = (managerId: string): ScoreHeatmap => {
  // Names no players, so it does not wait for the dictionary (A2b).
  useAllSeasons({ players: false });
  return useMemo(() => buildScoreHeatmap(managerId), [managerId]);
};
