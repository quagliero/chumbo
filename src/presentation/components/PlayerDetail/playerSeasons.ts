import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import type { PlayerPerformance } from "./PerformanceTable";

/**
 * One player's Chumbo seasons, one row each (I4) — for the "By season" card
 * and the season share cards on it.
 *
 * Counted by the SAME rules as the page's own career totals in
 * `usePlayerStats`, so the rows add up to the numbers printed above them:
 *
 *   - **points** are from weeks he was started. A bench week scored nobody
 *     anything, and the page's "Total Points" already excludes them;
 *   - **games** are starts plus bench weeks, bench weeks excluding the one the
 *     hook flags as his NFL bye (a zero on the bench that week is not a
 *     decision anybody made);
 *   - **best** is his best week whether started or not, which is what the
 *     page's "Highest Score" shows.
 *
 * A test holds the sums to the hook's totals.
 */
export interface PlayerSeasonRow {
  year: number;
  points: number;
  starts: number;
  games: number;
  best: number;
  /** Internal manager ids of everyone who rostered him, most weeks first. */
  managers: string[];
}

export const playerSeasons = (
  performances: readonly PlayerPerformance[]
): PlayerSeasonRow[] => {
  const byYear = new Map<
    number,
    PlayerSeasonRow & { weeksBy: Map<string, number> }
  >();

  for (const p of performances) {
    let row = byYear.get(p.year);
    if (!row) {
      row = {
        year: p.year,
        points: 0,
        starts: 0,
        games: 0,
        best: 0,
        managers: [],
        weeksBy: new Map(),
      };
      byYear.set(p.year, row);
    }
    if (p.wasStarted) {
      row.points += p.points;
      row.starts += 1;
      row.games += 1;
    } else if (!p.isByeWeek) {
      row.games += 1;
    }
    row.best = Math.max(row.best, p.points);
    const manager = getManagerIdBySleeperOwnerId(p.ownerId) ?? p.teamName;
    row.weeksBy.set(manager, (row.weeksBy.get(manager) ?? 0) + 1);
  }

  return [...byYear.values()]
    .map(({ weeksBy, ...row }) => ({
      ...row,
      managers: [...weeksBy.entries()]
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
        .map(([manager]) => manager),
    }))
    .sort((a, b) => b.year - a.year);
};
