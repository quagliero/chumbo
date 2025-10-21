import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedLeague } from "@/types/league";
import { getPlayoffWeekStart } from "./playoffUtils";
import { getCompletedWeek } from "./weekUtils";

interface SeasonData {
  matchups: Record<string, ExtendedMatchup[]>;
  rosters: ExtendedRoster[];
  league: ExtendedLeague;
}

/**
 * Calculate strength of schedule remaining for all teams
 * @param seasonData - The season data containing matchups and rosters
 * @returns Object mapping roster_id to strength of schedule rank (1-12, where 1 is hardest)
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

  // If no completed week info available, return empty
  if (completedWeek === null) {
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

  // Calculate remaining opponents' total points for each team
  const remainingOpponentsPoints: Record<number, number[]> = {};

  // Initialize for all teams
  seasonData.rosters.forEach((roster: ExtendedRoster) => {
    remainingOpponentsPoints[roster.roster_id] = [];
  });

  // Find remaining opponents for each team (only future weeks)
  Object.entries(seasonData.matchups).forEach(([weekStr, weekMatchups]) => {
    const week = parseInt(weekStr);

    // Only look at regular season weeks that are in the future (after completed week)
    if (week >= playoffWeekStart || week <= completedWeek) return;

    weekMatchups.forEach((matchup: ExtendedMatchup) => {
      // Find the opponent for this matchup
      const opponentMatchup = weekMatchups.find(
        (m: ExtendedMatchup) =>
          m.matchup_id === matchup.matchup_id &&
          m.roster_id !== matchup.roster_id
      );

      if (opponentMatchup) {
        // Add opponent's average points to the remaining opponents list
        remainingOpponentsPoints[matchup.roster_id].push(
          teamAvgPoints[opponentMatchup.roster_id]
        );
      }
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
        avgOpponentPoints[rosterId] = 0;
      }
    }
  );

  // Rank teams by average opponent points (highest = hardest schedule = rank 1)
  const sortedTeams = Object.entries(avgOpponentPoints)
    .map(([rosterIdStr, avgPoints]) => ({
      rosterId: parseInt(rosterIdStr),
      avgPoints,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints); // Sort descending (highest first)

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
 * @param seasonData - The season data containing matchups and rosters
 * @returns Strength of schedule rank (1-12, where 1 is hardest)
 */
export const getStrengthOfSchedule = (
  rosterId: number,
  seasonData: SeasonData
): number => {
  const allSOS = calculateStrengthOfSchedule(seasonData);
  return allSOS[rosterId] || 0;
};
