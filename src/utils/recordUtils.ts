import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";

/**
 * Calculate win percentage from wins, losses, and ties
 * @param wins - Number of wins
 * @param losses - Number of losses
 * @param ties - Number of ties
 * @returns Win percentage as a decimal (0-1)
 */
export const calculateWinPercentage = (
  wins: number,
  losses: number,
  ties: number
): number => {
  const totalGames = wins + losses + ties;
  return totalGames > 0 ? (wins + ties * 0.5) / totalGames : 0;
};

/**
 * Calculate win percentage as a percentage (0-100)
 * @param wins - Number of wins
 * @param losses - Number of losses
 * @param ties - Number of ties
 * @returns Win percentage as a percentage (0-100)
 */
export const calculateWinPercentageAsPercent = (
  wins: number,
  losses: number,
  ties: number
): number => {
  return calculateWinPercentage(wins, losses, ties) * 100;
};

/**
 * Extract points for from roster settings
 * @param roster - Roster object with settings
 * @returns Total points for
 */
export const getRosterPointsFor = (roster: ExtendedRoster): number => {
  return (
    (roster.settings?.fpts || 0) + (roster.settings?.fpts_decimal || 0) / 100
  );
};

/**
 * Extract points against from roster settings
 * @param roster - Roster object with settings
 * @returns Total points against
 */
export const getRosterPointsAgainst = (roster: ExtendedRoster): number => {
  return (
    (roster.settings?.fpts_against || 0) +
    (roster.settings?.fpts_against_decimal || 0) / 100
  );
};

/**
 * Determine matchup result based on points scored
 * @param teamPoints - Points scored by the team
 * @param opponentPoints - Points scored by the opponent
 * @returns "W" for win, "L" for loss, "T" for tie
 */
export const determineMatchupResult = (
  teamPoints: number,
  opponentPoints: number
): "W" | "L" | "T" => {
  if (teamPoints > opponentPoints) return "W";
  if (teamPoints < opponentPoints) return "L";
  return "T";
};

/**
 * Calculate league-wide performance for a team in a given week
 * @param teamMatchup - The team's matchup for the week
 * @param weekMatchups - All matchups for the week
 * @returns Object with league wins, losses, and ties
 */
export const calculateLeagueRecord = (
  teamMatchup: ExtendedMatchup,
  weekMatchups: ExtendedMatchup[]
): { leagueWins: number; leagueLosses: number; leagueTies: number } => {
  const allScores = weekMatchups.map((m) => m.points);
  const betterScores = allScores.filter(
    (score) => score > teamMatchup.points
  ).length;
  const worseScores = allScores.filter(
    (score) => score < teamMatchup.points
  ).length;
  const sameScores =
    allScores.filter((score) => score === teamMatchup.points).length - 1; // -1 for self

  return {
    leagueWins: worseScores,
    leagueLosses: betterScores,
    leagueTies: sameScores,
  };
};

/**
 * Calculate H2H record between two teams
 * @param team1RosterId - First team's roster ID
 * @param team2RosterId - Second team's roster ID
 * @param matchups - All matchups data
 * @param playoffWeekStart - Week when playoffs start (to filter out playoff games)
 * @returns Object with wins, losses, and ties
 */
export const calculateH2HRecord = (
  team1RosterId: number,
  team2RosterId: number,
  matchups: Record<string, ExtendedMatchup[]>,
  playoffWeekStart: number
): { wins: number; losses: number; ties: number } => {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  Object.keys(matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Skip playoff weeks - only count regular season games
    if (weekNum >= playoffWeekStart) return;

    const weekMatchups = matchups[weekKey];
    const team1Matchup = weekMatchups.find(
      (m) => m.roster_id === team1RosterId
    );
    const team2Matchup = weekMatchups.find(
      (m) => m.roster_id === team2RosterId
    );

    if (team1Matchup && team2Matchup) {
      // Check if they played each other this week
      if (team1Matchup.matchup_id === team2Matchup.matchup_id) {
        const result = determineMatchupResult(
          team1Matchup.points,
          team2Matchup.points
        );
        if (result === "W") wins++;
        else if (result === "L") losses++;
        else ties++;
      }
    }
  });

  return { wins, losses, ties };
};

/**
 * Calculate division record for a team
 * @param team - The team roster
 * @param divisionTeams - All teams in the division
 * @param matchups - All matchups data
 * @param playoffWeekStart - Week when playoffs start (to filter out playoff games)
 * @returns Object with wins, losses, and ties
 */
export const calculateDivisionRecord = (
  team: ExtendedRoster,
  divisionTeams: ExtendedRoster[],
  matchups: Record<string, ExtendedMatchup[]>,
  playoffWeekStart: number
): { wins: number; losses: number; ties: number } => {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  Object.keys(matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Skip playoff weeks - only count regular season games
    if (weekNum >= playoffWeekStart) return;

    const weekMatchups = matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m) => m.roster_id === team.roster_id
    );

    if (teamMatchup) {
      // Find opponent in this matchup
      const opponentMatchup = weekMatchups.find(
        (m) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== team.roster_id
      );

      if (opponentMatchup) {
        // Check if opponent is in the same division
        const opponentTeam = divisionTeams.find(
          (t) => t.roster_id === opponentMatchup.roster_id
        );
        if (opponentTeam) {
          const result = determineMatchupResult(
            teamMatchup.points,
            opponentMatchup.points
          );
          if (result === "W") wins++;
          else if (result === "L") losses++;
          else ties++;
        }
      }
    }
  });

  return { wins, losses, ties };
};

/**
 * Calculate weekly record against all teams in the league
 * @param roster - The team roster
 * @param week - Week number
 * @param matchups - All matchups data
 * @returns Object with wins, losses, ties, and points
 */
export const calculateWeeklyLeagueRecord = (
  roster: ExtendedRoster,
  week: number,
  matchups: Record<string, ExtendedMatchup[]>
): { wins: number; losses: number; ties: number; points: number } => {
  const weekMatchups = matchups[week.toString()];
  if (!weekMatchups) return { wins: 0, losses: 0, ties: 0, points: 0 };

  const rosterMatchup = weekMatchups.find(
    (m) => m.roster_id === roster.roster_id
  );
  if (!rosterMatchup) return { wins: 0, losses: 0, ties: 0, points: 0 };

  const teamPoints = rosterMatchup.points;
  let weeklyWins = 0;
  let weeklyLosses = 0;
  let weeklyTies = 0;

  // Compare this roster's score against all other rosters this week
  weekMatchups.forEach((otherMatchup) => {
    if (otherMatchup.roster_id === roster.roster_id) return;

    const result = determineMatchupResult(teamPoints, otherMatchup.points);
    if (result === "W") weeklyWins++;
    else if (result === "L") weeklyLosses++;
    else weeklyTies++;
  });

  return {
    wins: weeklyWins,
    losses: weeklyLosses,
    ties: weeklyTies,
    points: teamPoints,
  };
};

/**
 * Sort teams by win percentage, then by wins, then by points for
 * @param teams - Array of team objects with wins, losses, ties, and pointsFor
 * @returns Sorted array of teams
 */
export const sortTeamsByRecord = <
  T extends { wins: number; losses: number; ties: number; pointsFor: number }
>(
  teams: T[]
): T[] => {
  return teams.sort((a, b) => {
    const aWinPct = calculateWinPercentage(a.wins, a.losses, a.ties);
    const bWinPct = calculateWinPercentage(b.wins, b.losses, b.ties);

    if (aWinPct !== bWinPct) return bWinPct - aWinPct;
    if (a.wins !== b.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
};
