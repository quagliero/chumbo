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

interface TeamStats {
  rosterId: number;
  mean: number;
  stdDev: number;
  gamesPlayed: number;
}

interface SimulationResult {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  totalPoints: number;
}

interface PlayoffOddsResult {
  rosterId: number;
  positionOdds: Record<number, number>; // position -> percentage
  playoffOdds: number; // sum of positions 1-6
  wins: number;
  losses: number;
  ties: number;
}

interface UserPick {
  week: number;
  matchupId: number;
  winner: number; // roster_id of winner
  team1Score?: number;
  team2Score?: number;
}

interface UserScenario {
  picks: UserPick[];
}

/**
 * Generate a random number from a normal distribution using Box-Muller transform
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Calculate team statistics from completed regular season games
 */
function calculateTeamStats(
  seasonData: SeasonData,
  completedWeek: number
): TeamStats[] {
  const playoffWeekStart = getPlayoffWeekStart(seasonData);
  const teamStats: TeamStats[] = [];

  seasonData.rosters.forEach((roster) => {
    const scores: number[] = [];

    // Collect scores from completed regular season games
    Object.entries(seasonData.matchups).forEach(([weekStr, weekMatchups]) => {
      const week = parseInt(weekStr);

      // Only count completed regular season weeks
      if (week > completedWeek || week >= playoffWeekStart) return;

      const matchup = weekMatchups.find(
        (m) => m.roster_id === roster.roster_id
      );
      if (matchup) {
        scores.push(matchup.points);
      }
    });

    // Calculate mean and standard deviation
    const mean =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;

    const variance =
      scores.length > 1
        ? scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
          (scores.length - 1)
        : 0;

    const stdDev = Math.sqrt(variance);

    teamStats.push({
      rosterId: roster.roster_id,
      mean,
      stdDev,
      gamesPlayed: scores.length,
    });
  });

  return teamStats;
}

/**
 * Apply user scenario picks to get updated records
 */
function applyUserScenario(
  seasonData: SeasonData,
  userScenario?: UserScenario
): SimulationResult[] {
  const results: SimulationResult[] = [];

  // Initialize with current records
  seasonData.rosters.forEach((roster) => {
    results.push({
      rosterId: roster.roster_id,
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
      totalPoints: roster.settings.fpts + roster.settings.fpts_decimal / 100,
    });
  });

  // Apply user picks if provided
  if (userScenario?.picks) {
    userScenario.picks.forEach((pick) => {
      // Find the actual matchup to get both roster IDs
      const weekMatchups = seasonData.matchups[pick.week.toString()];
      if (!weekMatchups) return;

      const matchup = weekMatchups.find((m) => m.matchup_id === pick.matchupId);
      if (!matchup) return;

      const team1RosterId = matchup.roster_id;
      const team2Matchup = weekMatchups.find(
        (m) => m.matchup_id === pick.matchupId && m.roster_id !== team1RosterId
      );
      if (!team2Matchup) return;

      const team2RosterId = team2Matchup.roster_id;

      const team1Result = results.find((r) => r.rosterId === team1RosterId);
      const team2Result = results.find((r) => r.rosterId === team2RosterId);

      if (!team1Result || !team2Result) return;

      // Add points from user picks
      team1Result.totalPoints += pick.team1Score || 0;
      team2Result.totalPoints += pick.team2Score || 0;

      // Update wins/losses based on winner
      if (pick.winner === team1RosterId) {
        team1Result.wins++;
        team2Result.losses++;
      } else {
        team1Result.losses++;
        team2Result.wins++;
      }
    });
  }

  return results;
}

/**
 * Simulate a single season outcome
 */
function simulateSeason(
  seasonData: SeasonData,
  teamStats: TeamStats[],
  completedWeek: number,
  userScenario?: UserScenario
): SimulationResult[] {
  const playoffWeekStart = getPlayoffWeekStart(seasonData);
  const results: SimulationResult[] = [];

  // Initialize results with current records
  seasonData.rosters.forEach((roster) => {
    results.push({
      rosterId: roster.roster_id,
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
      totalPoints: roster.settings.fpts + roster.settings.fpts_decimal / 100,
    });
  });

  // Simulate remaining regular season weeks
  Object.entries(seasonData.matchups).forEach(([weekStr, weekMatchups]) => {
    const week = parseInt(weekStr);

    // Only simulate future regular season weeks
    if (week <= completedWeek || week >= playoffWeekStart) return;

    // Group matchups by matchup_id
    const groupedMatchups: { [key: string]: ExtendedMatchup[] } = {};
    weekMatchups.forEach((matchup) => {
      const key = matchup.matchup_id?.toString() || `bye_${matchup.roster_id}`;
      if (!groupedMatchups[key]) {
        groupedMatchups[key] = [];
      }
      groupedMatchups[key].push(matchup);
    });

    // Simulate each matchup
    Object.values(groupedMatchups).forEach((matchupPair) => {
      if (matchupPair.length !== 2) return; // Skip bye weeks

      const team1 = matchupPair[0];
      const team2 = matchupPair[1];

      // Check if user has picked this matchup
      const userPick = userScenario?.picks.find(
        (p) => p.week === week && p.matchupId === team1.matchup_id
      );

      let team1Score: number;
      let team2Score: number;

      if (userPick) {
        // Use user's picks
        team1Score = userPick.team1Score || 0;
        team2Score = userPick.team2Score || 0;
      } else {
        // Generate simulated scores using normal distribution
        const team1Stats = teamStats.find(
          (t) => t.rosterId === team1.roster_id
        );
        const team2Stats = teamStats.find(
          (t) => t.rosterId === team2.roster_id
        );

        if (!team1Stats || !team2Stats) return;

        team1Score = team1Stats.mean + team1Stats.stdDev * randomNormal();
        team2Score = team2Stats.mean + team2Stats.stdDev * randomNormal();
      }

      // Update results
      const team1Result = results.find((r) => r.rosterId === team1.roster_id)!;
      const team2Result = results.find((r) => r.rosterId === team2.roster_id)!;

      team1Result.totalPoints += team1Score;
      team2Result.totalPoints += team2Score;

      if (team1Score > team2Score) {
        team1Result.wins++;
        team2Result.losses++;
      } else if (team1Score < team2Score) {
        team1Result.losses++;
        team2Result.wins++;
      } else {
        team1Result.ties++;
        team2Result.ties++;
      }
    });
  });

  return results;
}

/**
 * Rank teams by record with tiebreaker (points for)
 */
function rankTeamsByRecord(results: SimulationResult[]): number[] {
  return results
    .sort((a, b) => {
      const aWinPct = a.wins / (a.wins + a.losses + a.ties);
      const bWinPct = b.wins / (b.wins + b.losses + b.ties);

      if (aWinPct !== bWinPct) return bWinPct - aWinPct;
      return b.totalPoints - a.totalPoints;
    })
    .map((r) => r.rosterId);
}

/**
 * Calculate playoff odds using Monte Carlo simulation
 */
export function calculatePlayoffOdds(
  seasonData: SeasonData,
  userScenario?: UserScenario
): PlayoffOddsResult[] {
  if (!seasonData.matchups || !seasonData.rosters || !seasonData.league) {
    return [];
  }

  const completedWeek = getCompletedWeek(seasonData.league);
  if (completedWeek === null) {
    return [];
  }

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  // Check if there are remaining regular season games to simulate
  const hasRemainingGames = Object.keys(seasonData.matchups).some((weekStr) => {
    const week = parseInt(weekStr);
    return week > completedWeek && week < playoffWeekStart;
  });

  if (!hasRemainingGames) {
    return [];
  }

  // Calculate team statistics
  const teamStats = calculateTeamStats(seasonData, completedWeek);

  // Initialize position counters
  const positionCounts: Record<number, Record<number, number>> = {};
  seasonData.rosters.forEach((roster) => {
    positionCounts[roster.roster_id] = {};
    for (let pos = 1; pos <= 12; pos++) {
      positionCounts[roster.roster_id][pos] = 0;
    }
  });

  // Run 10,000 simulations
  const numSimulations = 10000;
  for (let i = 0; i < numSimulations; i++) {
    const results = simulateSeason(
      seasonData,
      teamStats,
      completedWeek,
      userScenario
    );
    const rankings = rankTeamsByRecord(results);

    // Count positions
    rankings.forEach((rosterId, index) => {
      const position = index + 1;
      positionCounts[rosterId][position]++;
    });
  }

  // Convert counts to percentages
  const playoffOddsResults: PlayoffOddsResult[] = [];

  // Get updated records from user scenario
  const updatedRecords = applyUserScenario(seasonData, userScenario);

  seasonData.rosters.forEach((roster) => {
    const positionOdds: Record<number, number> = {};
    let playoffOdds = 0;

    for (let pos = 1; pos <= 12; pos++) {
      const percentage =
        (positionCounts[roster.roster_id][pos] / numSimulations) * 100;
      positionOdds[pos] = percentage;

      // Sum positions 1-6 for playoff odds
      if (pos <= 6) {
        playoffOdds += percentage;
      }
    }

    // Find updated record for this roster
    const updatedRecord = updatedRecords.find(
      (r) => r.rosterId === roster.roster_id
    );

    playoffOddsResults.push({
      rosterId: roster.roster_id,
      positionOdds,
      playoffOdds,
      wins: updatedRecord?.wins || roster.settings.wins,
      losses: updatedRecord?.losses || roster.settings.losses,
      ties: updatedRecord?.ties || roster.settings.ties,
    });
  });

  return playoffOddsResults;
}
