import { useMemo } from "react";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { getFinalStandings } from "@/utils/finalStandings";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import managers from "@/data/managers.json";

export interface RibbonPoint {
  year: number;
  /** 1 = champion. */
  position: number;
  /** Field size that season — 10 in 2012-13, 12 since. */
  field: number;
  /** True while the season is still being played, so the finish is provisional. */
  provisional: boolean;
}

export interface RibbonSeries {
  managerId: string;
  name: string;
  /** Points in year order, with a `null` for every season they sat out. */
  points: (RibbonPoint | null)[];
  seasonsPlayed: number;
  titles: number;
  bestFinish: number | null;
}

/**
 * Every manager's finishing position, season by season (D2).
 *
 * A manager who joined in 2018 or left in 2016 has `null` for the seasons they
 * were not in the league, which `linePath` renders as a break rather than a
 * line sloping in from a season they did not play.
 */
export const usePowerRibbon = (years: readonly number[] = YEAR_NUMBERS) => {
  return useMemo(() => {
    const byManager = new Map<string, (RibbonPoint | null)[]>();
    for (const manager of managers) byManager.set(manager.id, years.map(() => null));

    years.forEach((year, index) => {
      const season = seasons[year];
      if (!season?.rosters?.length) return;

      const standings = getFinalStandings(year);
      const field = season.rosters.length;
      // No brackets yet means the season is in progress: the order is real but
      // provisional, and the chart should say so rather than drawing it as
      // settled history.
      const provisional = (season.winners_bracket?.length ?? 0) === 0;

      for (const standing of standings) {
        const roster = season.rosters.find((r) => r.roster_id === standing.rosterId);
        const managerId = roster && getManagerIdBySleeperOwnerId(roster.owner_id);
        if (!managerId) continue;

        const series = byManager.get(managerId);
        if (series) {
          series[index] = { year, position: standing.position, field, provisional };
        }
      }
    });

    const series: RibbonSeries[] = managers
      .map((manager) => {
        const points = byManager.get(manager.id) ?? [];
        const played = points.filter((p): p is RibbonPoint => p !== null);
        return {
          managerId: manager.id,
          name: manager.name,
          points,
          seasonsPlayed: played.length,
          titles: played.filter((p) => p.position === 1 && !p.provisional).length,
          bestFinish: played.length
            ? Math.min(...played.map((p) => p.position))
            : null,
        };
      })
      // Managers who never played in the selected range would be an empty row
      // in the legend and nothing on the chart.
      .filter((s) => s.seasonsPlayed > 0)
      // Most decorated first, so the legend reads as a roll of honour rather
      // than as managers.json's insertion order.
      .sort(
        (a, b) =>
          b.titles - a.titles ||
          (a.bestFinish ?? 99) - (b.bestFinish ?? 99) ||
          b.seasonsPlayed - a.seasonsPlayed
      );

    const field = Math.max(
      ...years.map((year) => seasons[year]?.rosters?.length ?? 0),
      1
    );

    return { series, years: [...years], field };
  }, [years]);
};
