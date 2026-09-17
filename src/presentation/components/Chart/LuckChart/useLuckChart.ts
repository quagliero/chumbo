import { useMemo } from "react";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { CURRENT_YEAR, YEAR_NUMBERS } from "@/domain/constants";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { isWeekCompleted } from "@/utils/weekUtils";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { addLuck, seasonLuck, type RosterLuck } from "./luck";

export interface LuckPoint {
  managerId: string;
  name: string;
  /** Absent on a career row, which spans every season they played. */
  year?: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  actualWins: number;
  expectedWins: number;
  /** actual − expected. Positive is a schedule that flattered them. */
  luck: number;
  /** Seasons folded into this row: 1 for a season, n for a career. */
  seasons: number;
}

const emptyTotals = (managerId: string, name: string, year?: number) => ({
  managerId,
  name,
  year,
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  actualWins: 0,
  expectedWins: 0,
  seasons: 0,
});

/**
 * Which regular-season weeks of `year` count.
 *
 * Playoff weeks are out (see `luck.ts`), and for the season being played right
 * now only the weeks that have actually finished — an unplayed week sits in the
 * data as twelve zeros, which would read as a twelve-way tie and hand everyone
 * half an expected win. Completed weeks of an in-progress season are included,
 * though: nothing about a finished week is provisional, and the league will
 * want to see this season's luck while there is still time to complain about
 * it.
 *
 * Exported so `luck.test.ts` asserts the conservation invariant over exactly
 * the weeks the chart draws, rather than over its own second opinion of which
 * weeks those are.
 */
export const countedWeeks = (year: number): number[] => {
  const season = seasons[year];
  if (!season) return [];

  const playoffWeekStart = season.league?.settings?.playoff_week_start || 15;

  return Object.keys(season.matchups)
    .map(Number)
    .filter(
      (week) =>
        week < playoffWeekStart &&
        (year === CURRENT_YEAR ? isWeekCompleted(week, season.league) : true)
    )
    .sort((a, b) => a - b);
};

/**
 * Actual wins against expected wins, per manager-season and per career (D7).
 *
 * Attribution follows the rest of the site: a season's record belongs to the
 * roster's `owner_id` for the whole season. Four mid-season handovers in
 * `managers.json` have a `weeks` override that nothing in the app reads, so
 * this agrees with the standings rather than with that field — see the report
 * on D7.
 */
export const useLuckChart = () => {
  // The matchups are a lazy chunk (A2a); suspend until every season is in.
  useAllSeasons();

  // No dependencies: nothing below this line reads a prop or state, and by the
  // time the hook returns at all, every season's matchups are loaded and will
  // not change again for the life of the page.
  return useMemo(() => {
    const names = new Map(managers.map((m) => [m.id, m.name]));
    const careers = new Map<string, ReturnType<typeof emptyTotals>>();
    const seasonRows: LuckPoint[] = [];

    for (const year of YEAR_NUMBERS) {
      const season = seasons[year];
      if (!season?.rosters?.length) continue;

      const weeks = countedWeeks(year);
      if (!weeks.length) continue;

      const byRoster = new Map<number, RosterLuck>(
        seasonLuck(season.rosters, season.matchups, weeks).map((row) => [
          row.rosterId,
          row,
        ])
      );

      for (const roster of season.rosters) {
        const totals = byRoster.get(roster.roster_id);
        const managerId = getManagerIdBySleeperOwnerId(roster.owner_id);
        if (!totals || !managerId || totals.games === 0) continue;

        const name = names.get(managerId) ?? managerId;
        const row = addLuck(emptyTotals(managerId, name, year), totals);
        seasonRows.push({
          ...row,
          seasons: 1,
          luck: row.actualWins - row.expectedWins,
        });

        const career = addLuck(
          careers.get(managerId) ?? emptyTotals(managerId, name),
          totals
        );
        // Season count is not part of the luck totals, so it is kept here.
        career.seasons += 1;
        careers.set(managerId, career);
      }
    }

    const careerRows: LuckPoint[] = [...careers.values()].map((row) => ({
      ...row,
      luck: row.actualWins - row.expectedWins,
    }));

    // Luckiest first in both lists: the legend, the fallback table and the
    // label placement all read in this order, and "who has been robbed" is the
    // question the chart exists to answer.
    const byLuck = (a: LuckPoint, b: LuckPoint) => b.luck - a.luck;

    return {
      careerRows: careerRows.sort(byLuck),
      seasonRows: seasonRows.sort(byLuck),
      /** The seasons that contributed, for the caption. */
      years: YEAR_NUMBERS.filter((year) => countedWeeks(year).length > 0),
    };
  }, []);
};
