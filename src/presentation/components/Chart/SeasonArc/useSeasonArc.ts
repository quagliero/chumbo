import { useMemo } from "react";
import { useSeasonData } from "@/hooks/useSeasonData";
import { getManagerBySleeperOwnerId } from "@/utils/managerUtils";
import { getTeamName } from "@/utils/teamName";
import { arcWeeks, byStanding, seasonArc, type ArcSeries } from "./arc";

export interface ArcManagerSeries extends ArcSeries {
  /** `managers.json` id, when the owner resolves to one. Drives the accent. */
  managerId: string | null;
  /** Short handle for the legend — "rich", not "Rich's Ruthless Ravagers". */
  label: string;
  /** The full team name, for the fallback table and the link labels. */
  teamName: string;
}

export interface SeasonArcData {
  series: ArcManagerSeries[];
  /** The weeks actually drawn, in order. Empty before a ball is kicked. */
  weeks: number[];
  /** How many regular-season weeks the season has in total. */
  regularSeasonWeeks: number;
  /** True when the season still has weeks to play. */
  inProgress: boolean;
}

/**
 * One season's arc, ready to draw (D1).
 *
 * Identity is resolved per ROSTER, not per manager. A season arc only ever
 * shows one season, so the roster is the thing that has a line, and going
 * through `managers.json` first would silently drop the four legacy accounts
 * that own the 2012-2019 rosters — the archive the Seasons page exists to show.
 * The manager id is looked up anyway, because the accent colour needs one, but
 * a roster whose owner does not resolve still gets a line and a team name.
 *
 * `useSeasonData` suspends until that season's matchups have loaded (A2a), so
 * everything below the hook can read them synchronously.
 */
export const useSeasonArc = (year: number): SeasonArcData => {
  const season = useSeasonData(year);

  return useMemo(() => {
    const matchups = season?.matchups ?? {};
    const league = season?.league;
    const regularSeasonWeeks = (league?.settings?.playoff_week_start || 15) - 1;

    if (!season?.rosters?.length) {
      return { series: [], weeks: [], regularSeasonWeeks, inProgress: false };
    }

    const weeks = arcWeeks(matchups, league);

    const series = seasonArc(season.rosters, matchups, weeks)
      // A roster with no completed game is an empty legend chip and nothing on
      // the chart. Pre-season, that is every roster, and the caller renders
      // nothing at all.
      .filter((row) => row.games > 0)
      .map((row) => {
        const manager = getManagerBySleeperOwnerId(row.ownerId);
        const teamName = getTeamName(row.ownerId, season.users);
        return {
          ...row,
          managerId: manager?.id ?? null,
          label: manager?.name ?? teamName,
          teamName,
        };
      })
      .sort(byStanding);

    return {
      series,
      weeks,
      regularSeasonWeeks,
      inProgress: weeks.length < regularSeasonWeeks,
    };
  }, [season]);
};
