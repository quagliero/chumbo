import { useMemo } from "react";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import type { ExtendedRoster } from "@/types/roster";
import { getFinalStandings, type FinalStanding } from "@/utils/finalStandings";
import type { SeasonStats } from "@/utils/managerStats";
import { isSeasonSettled } from "@/utils/playoffUtils";

/**
 * One manager's career, season by season, for the timeline on their page (F3).
 *
 * **The finish here is the real one.** `SeasonStats.finalStanding` is regular
 * season record order: a team that went 12-1 and lost in the semi-final comes
 * out of it first, which is not a finish anyone in this league would recognise,
 * and it is what the eight stat tiles this replaces were built on.
 * `getFinalStandings` reads the two playoff brackets instead, with all the
 * numbering subtlety that requires — see the comment at the top of
 * `utils/finalStandings.ts`, which is the only place that logic should live.
 *
 * The records, points and scoring crowns still come from `SeasonStats`, because
 * those follow the page's data-mode selector (regular season / playoffs /
 * combined) and the finish does not: a season has exactly one finishing
 * position however you count the games leading to it.
 */

export interface TimelineSeason {
  year: number;
  /** 1 = champion. `null` if the season has no standings at all. */
  position: number | null;
  /** Teams in the league that year — 10 in 2012-13, 12 since. */
  field: number;
  /**
   * How the position was decided. `"record"` means the brackets did not place
   * this roster: either the season is still being played, or it is 2012/2013,
   * where the bracket covered only eight of the ten teams.
   */
  source: FinalStanding["source"] | null;
  /**
   * The season is still being played — no winners bracket yet — so the finish
   * is a league table, not a result. Nothing provisional earns a trophy.
   */
  inProgress: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Led the league in points scored. */
  scoringCrown: boolean;
  madePlayoffs: boolean;
}

export interface CareerTimeline {
  seasons: TimelineSeason[];
  titles: number;
  finals: number;
  podiums: number;
  scoringCrowns: number;
  playoffBerths: number;
  /** Best SETTLED finish. `null` until they have finished a season. */
  bestFinish: number | null;
}

/**
 * Build the timeline.
 *
 * Exported for the tests: the two ways this goes silently wrong are a finish
 * taken from the wrong source (regular-season order dressed up as a real one)
 * and a trophy awarded for a season still being played, and both look like
 * plausible data on screen.
 */
export const buildCareerTimeline = (
  managerId: string,
  seasonStats: readonly SeasonStats[]
): CareerTimeline => {
  const manager = managers.find((m) => m.id === managerId);

  const rows: TimelineSeason[] = seasonStats
    .map((stat) => {
      const season = seasons[stat.year];
      const rosters = (season?.rosters ?? []) as ExtendedRoster[];
      const roster = manager
        ? rosters.find((r) => r.owner_id === manager.sleeper.id)
        : undefined;

      const standing = roster
        ? getFinalStandings(stat.year).find(
            (entry) => entry.rosterId === roster.roster_id
          )
        : undefined;

      return {
        year: stat.year,
        position: standing?.position ?? null,
        field: rosters.length,
        source: standing?.source ?? null,
        // No final yet means the season is in progress. Same test the power
        // ribbon uses (D2), so the two agree about which season is live.
        inProgress: !isSeasonSettled(season),
        wins: stat.wins,
        losses: stat.losses,
        ties: stat.ties,
        pointsFor: stat.pointsFor,
        pointsAgainst: stat.pointsAgainst,
        scoringCrown: Boolean(stat.scoringCrown),
        madePlayoffs: Boolean(stat.madePlayoffs),
      } satisfies TimelineSeason;
    })
    .sort((a, b) => a.year - b.year);

  const settled = rows.filter((row) => !row.inProgress && row.position !== null);
  const positions = settled.map((row) => row.position as number);

  return {
    seasons: rows,
    titles: positions.filter((position) => position === 1).length,
    finals: positions.filter((position) => position <= 2).length,
    podiums: positions.filter((position) => position <= 3).length,
    scoringCrowns: rows.filter((row) => row.scoringCrown).length,
    playoffBerths: rows.filter((row) => row.madePlayoffs).length,
    // Settled seasons only, for the same reason `titles` excludes them: in
    // September a manager with nothing in the cabinet tops the table on two
    // results, and a page reading "no titles yet · best 1st" contradicts
    // itself in the space of two lines (the bug F1c found).
    bestFinish: positions.length ? Math.min(...positions) : null,
  };
};

/**
 * The timeline.
 *
 * No `useAllSeasons` here: the manager page already suspends on it before
 * `getManagerStats` runs, and `seasonStats` could not exist otherwise.
 */
export const useCareerTimeline = (
  managerId: string,
  seasonStats: readonly SeasonStats[]
): CareerTimeline =>
  useMemo(
    () => buildCareerTimeline(managerId, seasonStats),
    [managerId, seasonStats]
  );
