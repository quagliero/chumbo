import { useMemo } from "react";
import { seasons } from "@/data";
import { getManagerBySleeperOwnerId } from "@/utils/managerUtils";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import {
  calculateScheduleOdds,
  calculateTeamStats,
  type ScheduleOdds,
} from "@/utils/playoffOdds";
import {
  remainingSchedule,
  scheduleLuck,
  type RemainingSchedule,
  type TeamLuck,
} from "@/utils/scheduleLuck";
import { mergeScheduledFixtures } from "@/utils/scheduleUtils";
import { getCompletedWeek, isWeekCompleted } from "@/utils/weekUtils";

export interface Team {
  rosterId: number;
  ownerId: string;
  /** The manager's short name, which fits in a grid cell. */
  name: string;
}

export interface SchedulePlayoffs {
  rosterId: number;
  /** Playoff odds on the real schedule, % — 0 or 100 once it is decided. */
  actual: number;
  /** ...with the results so far and an average draw from here. */
  neutralRest: number;
  /** ...with an average draw all season. */
  fair: number;
}

export interface ScheduleLuckData {
  teams: Map<number, Team>;
  /** Sorted luckiest first. */
  luck: TeamLuck[];
  weeks: number[];
  /** Whether regular-season games are still to be played. */
  live: boolean;
  playoffTeams: number;
  playoffs: SchedulePlayoffs[];
  /** Empty unless `live`. */
  remaining: RemainingSchedule[];
  remainingWeeks: number[];
}

/**
 * Who made the playoffs, once it is known: everyone in the winners bracket.
 * Read from the bracket rather than re-ranked, because the division seasons
 * seeded division winners the record alone would not have.
 */
const bracketTeams = (year: number): Set<number> | null => {
  const bracket = seasons[year].winners_bracket;
  if (!bracket?.length) return null;
  const teams = new Set<number>();
  for (const match of bracket) {
    for (const team of [match.t1, match.t2]) {
      if (typeof team === "number") teams.add(team);
    }
  }
  return teams;
};

/**
 * Everything the schedule-luck tab draws, from one season. The simulation is
 * seeded by the year, so the page gives the same answer on every visit.
 */
export const useScheduleLuck = (year: number): ScheduleLuckData =>
  useMemo(() => {
    const season = seasons[year];
    const { league, rosters, matchups } = season;
    const playoffWeekStart = getPlayoffWeekStart(season);
    const playoffTeams = league.settings?.playoff_teams || 6;
    const completedWeek = getCompletedWeek(league);

    const teams = new Map(
      rosters.map((roster) => [
        roster.roster_id,
        {
          rosterId: roster.roster_id,
          ownerId: roster.owner_id,
          name:
            getManagerBySleeperOwnerId(roster.owner_id)?.name ??
            `Team ${roster.roster_id}`,
        },
      ])
    );

    const weeks = Object.keys(matchups)
      .map(Number)
      .filter((week) => week < playoffWeekStart && isWeekCompleted(week, league))
      .sort((a, b) => a - b);

    const luck = scheduleLuck(rosters, matchups, weeks).sort(
      (a, b) => b.luck - a.luck || b.percentile - a.percentile
    );

    const fixtures = mergeScheduledFixtures(matchups, season.schedule);
    const remainingWeeks =
      completedWeek === null
        ? []
        : Object.keys(fixtures)
            .map(Number)
            .filter((week) => week > completedWeek && week < playoffWeekStart)
            .sort((a, b) => a - b);
    const live = remainingWeeks.length > 0;

    const odds: ScheduleOdds[] =
      weeks.length > 0
        ? calculateScheduleOdds(season, fixtures, { seed: year })
        : [];
    const made = live ? null : bracketTeams(year);
    const playoffs = odds.map((o) => ({
      rosterId: o.rosterId,
      actual: made ? (made.has(o.rosterId) ? 100 : 0) : o.actual,
      neutralRest: made ? (made.has(o.rosterId) ? 100 : 0) : o.neutralRest,
      fair: o.neutral,
    }));

    const remaining = live
      ? remainingSchedule(
          fixtures,
          remainingWeeks,
          calculateTeamStats(season, completedWeek ?? 0)
        ).sort((a, b) => b.difficulty - a.difficulty)
      : [];

    return {
      teams,
      luck,
      weeks,
      live,
      playoffTeams,
      playoffs,
      remaining,
      remainingWeeks,
    };
  }, [year]);

/** The luck views, each a tab of the season's Schedule page. */
export type LuckView = "luck" | "playoffs" | "weeks" | "remaining";

/** Whether the season has games still to play, so a Remaining tab. */
export const useHasRemaining = (year: number) => {
  const data = useScheduleLuck(year);
  return data.live && data.remaining.length > 0;
};
