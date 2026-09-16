import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedLeague } from "@/types/league";
import { getPlayoffWeekStart } from "./playoffUtils";
import { getCompletedWeek } from "./weekUtils";

interface SeasonData {
  matchups: Record<string, ExtendedMatchup[]>;
  rosters: ExtendedRoster[];
  league: ExtendedLeague;
  /**
   * Unplayed fixtures, from `schedule.json`. Only written while a season is in
   * progress, so it is absent for every completed season — and the whole
   * calculation is about games still to come, so without it there is nothing
   * to rank.
   */
  schedule?: Record<string, ScheduledMatchup[]>;
}

/**
 * Every regular season pairing we know about, week by week, whether or not it
 * has been played.
 *
 * `matchups/<week>.json` only exists once a week has been played, so future
 * fixtures are only ever found in `schedule.json`. Where both exist the played
 * matchup wins, exactly as `PlayoffOdds` merges the two.
 */
const fixturesByWeek = (
  seasonData: SeasonData
): Record<string, ScheduledMatchup[]> => {
  const fixtures: Record<string, ScheduledMatchup[]> = {};

  Object.entries(seasonData.matchups ?? {}).forEach(([week, weekMatchups]) => {
    fixtures[week] = weekMatchups.map(({ matchup_id, roster_id }) => ({
      matchup_id,
      roster_id,
    }));
  });

  Object.entries(seasonData.schedule ?? {}).forEach(([week, weekFixtures]) => {
    if (fixtures[week]) return;
    fixtures[week] = weekFixtures;
  });

  return fixtures;
};

/**
 * Calculate strength of schedule *remaining* for all teams.
 *
 * Each team's remaining regular season opponents are looked up from the
 * fixture list (played weeks from `matchups`, unplayed weeks from
 * `schedule.json`), and scored by those opponents' average points per game so
 * far. Highest average opponent = hardest remaining schedule = rank 1.
 *
 * Returns `{}` — deliberately, not incidentally — whenever there is nothing
 * remaining to rank:
 *
 *   - no matchups or rosters;
 *   - a historical season with no `leg` setting (`getCompletedWeek` is null);
 *   - **any completed season**, and any in-progress season whose regular
 *     fixtures have all been played: there are no remaining opponents, so
 *     every average would be 0 and the "ranking" would be nothing but the
 *     order the rosters happen to be iterated in.
 *
 * Callers must treat `{}` as "not applicable" and show nothing, rather than
 * rendering a column of empty cells.
 *
 * @param seasonData - matchups, rosters, league, and (for a live season) schedule
 * @returns Object mapping roster_id to rank (1 = hardest remaining schedule)
 */
export const calculateStrengthOfSchedule = (
  seasonData: SeasonData
): Record<number, number> => {
  if (!seasonData.matchups || !seasonData.rosters) {
    return {};
  }

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  // Get the most recent completed week from league data
  const completedWeek = getCompletedWeek(seasonData.league);

  // No `leg` setting: a historical season, with no remaining schedule.
  if (completedWeek === null) {
    return {};
  }

  const fixtures = fixturesByWeek(seasonData);

  const remainingWeeks = Object.keys(fixtures)
    .map((week) => parseInt(week))
    .filter((week) => week > completedWeek && week < playoffWeekStart);

  // Nothing left to play — a completed season, or a live one whose regular
  // season is over. There is no remaining schedule to have a strength.
  if (remainingWeeks.length === 0) {
    return {};
  }

  // Calculate total points scored by each team so far (only completed games)
  const teamTotalPoints: Record<number, number> = {};
  const teamGamesPlayed: Record<number, number> = {};

  // Initialize all teams with 0 points and 0 games
  seasonData.rosters.forEach((roster: ExtendedRoster) => {
    teamTotalPoints[roster.roster_id] = 0;
    teamGamesPlayed[roster.roster_id] = 0;
  });

  // Sum up points for each team from completed regular season games only
  Object.entries(seasonData.matchups).forEach(([weekStr, weekMatchups]) => {
    const week = parseInt(weekStr);

    // Only count regular season weeks that are completed
    if (week >= playoffWeekStart || week > completedWeek) return;

    weekMatchups.forEach((matchup: ExtendedMatchup) => {
      teamTotalPoints[matchup.roster_id] += matchup.points;
      teamGamesPlayed[matchup.roster_id] += 1;
    });
  });

  // Calculate average points per game for each team
  const teamAvgPoints: Record<number, number> = {};
  seasonData.rosters.forEach((roster: ExtendedRoster) => {
    teamAvgPoints[roster.roster_id] =
      teamGamesPlayed[roster.roster_id] > 0
        ? teamTotalPoints[roster.roster_id] / teamGamesPlayed[roster.roster_id]
        : 0;
  });

  // Calculate remaining opponents' average points for each team
  const remainingOpponentsPoints: Record<number, number[]> = {};

  // Initialize for all teams
  seasonData.rosters.forEach((roster: ExtendedRoster) => {
    remainingOpponentsPoints[roster.roster_id] = [];
  });

  // Find remaining opponents for each team (only future weeks)
  remainingWeeks.forEach((week) => {
    const weekFixtures = fixtures[String(week)];
    if (!weekFixtures) return;

    weekFixtures.forEach((fixture) => {
      // Find the opponent for this matchup
      const opponent = weekFixtures.find(
        (other) =>
          other.matchup_id === fixture.matchup_id &&
          other.roster_id !== fixture.roster_id
      );

      // Teams on a bye this week simply have one fewer remaining opponent
      if (!opponent) return;
      if (!remainingOpponentsPoints[fixture.roster_id]) return;

      remainingOpponentsPoints[fixture.roster_id].push(
        teamAvgPoints[opponent.roster_id] ?? 0
      );
    });
  });

  // Calculate average opponent points for each team
  const avgOpponentPoints: Record<number, number> = {};

  Object.entries(remainingOpponentsPoints).forEach(
    ([rosterIdStr, opponentPoints]) => {
      const rosterId = parseInt(rosterIdStr);
      if (opponentPoints.length > 0) {
        avgOpponentPoints[rosterId] =
          opponentPoints.reduce((sum, points) => sum + points, 0) /
          opponentPoints.length;
      } else {
        // No games left at all: ranked last, not "hardest".
        avgOpponentPoints[rosterId] = 0;
      }
    }
  );

  // Rank teams by average opponent points (highest = hardest schedule = rank 1).
  // Ties break on roster id so the result never depends on iteration order.
  const sortedTeams = Object.entries(avgOpponentPoints)
    .map(([rosterIdStr, avgPoints]) => ({
      rosterId: parseInt(rosterIdStr),
      avgPoints,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints || a.rosterId - b.rosterId);

  // Create ranking object (1 = hardest schedule)
  const strengthOfScheduleRank: Record<number, number> = {};
  sortedTeams.forEach((team, index) => {
    strengthOfScheduleRank[team.rosterId] = index + 1;
  });

  return strengthOfScheduleRank;
};

/**
 * Get strength of schedule remaining for a specific team
 * @param rosterId - The roster ID to get strength of schedule for
 * @param seasonData - The season data containing matchups, rosters and schedule
 * @returns Strength of schedule rank (1 = hardest), or 0 when the season has
 * no remaining schedule to rank (see `calculateStrengthOfSchedule`)
 */
export const getStrengthOfSchedule = (
  rosterId: number,
  seasonData: SeasonData
): number => {
  const allSOS = calculateStrengthOfSchedule(seasonData);
  return allSOS[rosterId] || 0;
};
