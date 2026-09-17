/**
 * The matchup page's rail, wired up (E2).
 *
 * Everything the rail needs is already on the page except the all-time series
 * count, which comes from the precomputed file. That is fetched WITHOUT
 * suspending, the same pattern (and for the same reason) as `NarrativeNotes`: a
 * matchup must not hold its own render on a garnish, so the rail renders
 * immediately and the one item that needs the file gains its sentence when the
 * file lands.
 */
import { useEffect, useState } from "react";
import {
  getPrecomputedStats,
  loadPrecomputedStats,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";
import { getFinalStandings } from "@/utils/finalStandings";
import type { ExtendedMatchup } from "@/types/matchup";
import { SeeAlso } from "./SeeAlso";
import { buildMatchupRail, findRivalry, type RailTeam } from "./matchupRail";

/**
 * The precomputed file, without suspending. Deduped and cached by
 * `loadPrecomputedStats`, so on this page — which already carries E7's notes —
 * this costs no second fetch.
 */
const usePrecomputedStatsWhenReady = (): PrecomputedStats | null => {
  const [stats, setStats] = useState(getPrecomputedStats);

  useEffect(() => {
    if (stats) return;
    let live = true;
    loadPrecomputedStats()
      .then((loaded) => {
        if (live) setStats(loaded);
      })
      .catch(() => {
        // No file means no series count — the rest of the rail is unaffected,
        // and `NarrativeNotes` already logs the failure once.
      });
    return () => {
      live = false;
    };
  }, [stats]);

  return stats;
};

export interface MatchupSeeAlsoProps {
  year: number;
  week: number;
  matchupId: number;
  teams: [Omit<RailTeam, "finish">, Omit<RailTeam, "finish">];
  matchups: Record<string, ExtendedMatchup[]>;
  nameOf: (rosterId: number) => string;
  isPlayed: (week: number) => boolean;
  teamCount: number;
}

export const MatchupSeeAlso = ({
  year,
  week,
  matchupId,
  teams,
  matchups,
  nameOf,
  isPlayed,
  teamCount,
}: MatchupSeeAlsoProps) => {
  const stats = usePrecomputedStatsWhenReady();
  const rivalryStat = stats?.stats.find((stat) => stat.id === "rivalry-intensity");

  // Where they finished, off the brackets — eager data, no fetch. A season with
  // no brackets yet falls back to record order inside `getFinalStandings`,
  // which is not a finish, so that case is dropped rather than claimed.
  const standings = getFinalStandings(year);
  const finishOf = (rosterId: number): number | null => {
    const placing = standings.find((entry) => entry.rosterId === rosterId);
    return placing?.source === "bracket" ? placing.position : null;
  };

  const withFinish = teams.map((team) => ({
    ...team,
    finish: finishOf(team.rosterId),
  })) as [RailTeam, RailTeam];

  return (
    <SeeAlso
      sections={buildMatchupRail({
        year,
        week,
        matchupId,
        teams: withFinish,
        matchups,
        nameOf,
        isPlayed,
        teamCount,
        rivalry: findRivalry(
          rivalryStat?.entries,
          withFinish[0].managerId,
          withFinish[1].managerId
        ),
      })}
    />
  );
};
