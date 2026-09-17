import { ExtendedLeague } from "@/types/league";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import {
  determineMatchupResult,
  roundToTwoDecimals,
} from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";

/**
 * The season arc (D1) — the running total, week by week.
 *
 * THE DEFINITION, kept here as a pure function of the numbers so it can be
 * tested without a DOM:
 *
 *   For each counted week, a manager's cumulative WINS is their record so far
 *   with a tie counting half — the same convention `luck.ts` uses, and the one
 *   that keeps a drawn game worth the same to both sides. Their cumulative
 *   POINTS is the sum of every score so far.
 *
 * Both are monotonic: a line can flatten, which is exactly the collapse the
 * chart exists to show, but it can never come down. That is the property the
 * tests assert, because a cumulative series that dips means the derivation is
 * double-counting or losing a week.
 *
 * The judgement calls, each of them a place this could be quietly wrong:
 *
 * - **Regular season only** (`week < playoff_week_start`). Half the league is
 *   playing consolation games after that, and the standings this chart sits
 *   above stop at the same week. Including playoff weeks would make the arc
 *   disagree with the table beneath it.
 * - **A week only counts if it finished.** See `arcWeeks` — this is what keeps
 *   the season being played from lying.
 * - **A week a manager has no opponent in is a gap, not a zero.** The running
 *   total carries across it, but the point is `null` so `linePath` lifts the
 *   pen rather than drawing through a week that was never played.
 * - **Scores are compared at two decimals**, Sleeper's own precision, so a
 *   float artefact never decides a game.
 */

/** One manager's position after one week. */
export interface ArcPoint {
  week: number;
  /** That week's score, not the running total. */
  score: number;
  result: "W" | "L" | "T";
  /** For the link out to the matchup. `null` on a bye. */
  matchupId: number | null;
  /** Running total of wins after this week, a tie counting half. */
  wins: number;
  /** Running total of points for after this week. */
  points: number;
}

export interface ArcSeries {
  rosterId: number;
  ownerId: string;
  /**
   * One entry per counted week, in week order, with `null` for a week this
   * manager did not play.
   */
  points: (ArcPoint | null)[];
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** Final cumulative totals, for sorting and for the legend. */
  totalWins: number;
  totalPoints: number;
}

/**
 * The weeks of a season the arc may draw.
 *
 * **This is the function that stops the in-progress season lying.** An unplayed
 * week sits in the data as twelve zero scores; drawn as-is it reads as the
 * whole league collapsing to a flat line in the same week, which is both wrong
 * and the single most noticeable thing on the chart. So a week has to clear two
 * gates:
 *
 *   1. `isWeekCompleted` — Sleeper's own `last_scored_leg` / `leg`. A finished
 *      season has no `leg` at all and every regular-season week passes, which
 *      is why the caller does not have to special-case history.
 *   2. Somebody scored. Belt to the above's braces: a week fetched while it was
 *      being played is all zeros regardless of what `leg` says, and a
 *      twelve-way 0-0 tie would hand out six fictional wins.
 *
 * Exported so the tests assert over exactly the weeks the chart draws rather
 * than over their own second opinion of which weeks those are.
 */
export const arcWeeks = (
  matchups: Record<string, ExtendedMatchup[]>,
  league: ExtendedLeague | undefined
): number[] => {
  const playoffWeekStart = league?.settings?.playoff_week_start || 15;

  return Object.keys(matchups)
    .map(Number)
    .filter((week) => {
      if (!Number.isFinite(week) || week >= playoffWeekStart) return false;
      if (!isWeekCompleted(week, league)) return false;
      const played = matchups[week.toString()] ?? [];
      return played.some((m) => roundToTwoDecimals(m.points ?? 0) > 0);
    })
    .sort((a, b) => a - b);
};

/**
 * Every roster's running totals over `weeks`.
 *
 * Takes the weeks rather than working them out, for the same reason `luck.ts`
 * does: the policy (playoff cut-off, how much of a live season has finished)
 * belongs to the caller, and this stays arithmetic.
 */
export const seasonArc = (
  rosters: readonly ExtendedRoster[],
  matchups: Record<string, ExtendedMatchup[]>,
  weeks: readonly number[]
): ArcSeries[] =>
  rosters.map((roster) => {
    const series: ArcSeries = {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      points: [],
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      totalWins: 0,
      totalPoints: 0,
    };

    for (const week of weeks) {
      const weekMatchups = matchups[week.toString()];
      const own = weekMatchups?.find((m) => m.roster_id === roster.roster_id);
      const opponent =
        own &&
        weekMatchups?.find(
          (m) =>
            m.matchup_id === own.matchup_id && m.roster_id !== roster.roster_id
        );

      // A roster missing from the file, or one with no opponent, played no
      // game: the totals carry forward untouched and the point is a gap.
      if (!own || !opponent) {
        series.points.push(null);
        continue;
      }

      const score = roundToTwoDecimals(own.points ?? 0);
      const result = determineMatchupResult(
        score,
        roundToTwoDecimals(opponent.points ?? 0)
      );

      series.games += 1;
      if (result === "W") series.wins += 1;
      else if (result === "L") series.losses += 1;
      else series.ties += 1;

      series.totalWins += result === "W" ? 1 : result === "T" ? 0.5 : 0;
      // Rounded on the way in, then summed: the running total is what gets
      // plotted and compared, so it must not accumulate float dust.
      series.totalPoints = roundToTwoDecimals(series.totalPoints + score);

      series.points.push({
        week,
        score,
        result,
        matchupId: own.matchup_id ?? null,
        wins: series.totalWins,
        points: series.totalPoints,
      });
    }

    return series;
  });

/**
 * Standings order: wins, then points scored — the same sort the Seasons page
 * applies to the table this chart sits above, so the legend and the table read
 * in the same order.
 */
export const byStanding = (a: ArcSeries, b: ArcSeries): number =>
  b.totalWins - a.totalWins || b.totalPoints - a.totalPoints;
