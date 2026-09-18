import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedLeague } from "@/types/league";
import { getPlayoffWeekStart } from "./playoffUtils";
import { getCompletedWeek } from "./weekUtils";
import { calculateWinPercentage } from "@/utils/recordUtils";

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
  pointsFor: number;
  pointsAgainst: number;
}

interface PlayoffOddsResult {
  rosterId: number;
  positionOdds: Record<number, number>; // position -> percentage
  playoffOdds: number; // sum of positions 1-6
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
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

/** A source of uniform numbers in [0, 1), like `Math.random`. */
export type Random = () => number;

/**
 * A seeded `Random` (mulberry32). The same seed gives the same sequence, so a
 * simulation run for a page and for its link preview agree to the decimal,
 * which two runs of `Math.random` do not (K1).
 */
export const seededRandom = (seed: number): Random => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Generate a random number from a normal distribution using Box-Muller transform
 */
function randomNormal(random: Random): number {
  // 1 - u: Box-Muller takes the log of the first draw, and a seeded source
  // can return exactly 0.
  const u1 = 1 - random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Told about every simulated game, for a caller that needs more than the table. */
type GameObserver = (
  week: number,
  team1: number,
  team2: number,
  team1Score: number,
  team2Score: number
) => void;

const getMean = (scores: number[]): number =>
  scores.length > 0
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;

const getStdDev = (scores: number[], mean: number): number =>
  scores.length > 1
    ? Math.sqrt(
        scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
          (scores.length - 1)
      )
    : 0;

/**
 * How many games at the league average every team is assumed to have played
 * before its first real one.
 *
 * Without it a team's simulated mean was its actual mean, and after week 1
 * that is one score: the week-1 top scorer went into the playoffs in 100% of
 * simulations and the bottom scorer in under 1%, and K1 printed those as the
 * stakes. One game says very little about a fantasy team; a weekly score
 * varies about 2.5 times more than the gap between good and bad teams, which
 * puts the honest weight of the league average at a handful of games. Four
 * dominates in September and barely matters by December — thirteen real
 * games against four notional ones — which is the behaviour wanted.
 */
export const PRIOR_GAMES = 4;

/**
 * Calculate team statistics from completed regular season games, each team's
 * mean and spread pulled towards the league's by `PRIOR_GAMES`. A team with no
 * games uses the league's, so early-season simulations still vary.
 */
export function calculateTeamStats(
  seasonData: SeasonData,
  completedWeek: number
): TeamStats[] {
  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  const scoresByRoster = new Map<number, number[]>(
    seasonData.rosters.map((roster) => [roster.roster_id, []])
  );

  // Collect scores from completed regular season games
  Object.entries(seasonData.matchups).forEach(([weekStr, weekMatchups]) => {
    const week = parseInt(weekStr);

    // Only count completed regular season weeks
    if (week > completedWeek || week >= playoffWeekStart) return;

    weekMatchups.forEach((matchup) => {
      scoresByRoster.get(matchup.roster_id)?.push(matchup.points);
    });
  });

  const leagueScores = [...scoresByRoster.values()].flat();
  const leagueMean = getMean(leagueScores);
  const leagueStdDev = getStdDev(leagueScores, leagueMean);

  return seasonData.rosters.map((roster) => {
    const scores = scoresByRoster.get(roster.roster_id) ?? [];
    const n = scores.length;
    const mean =
      (scores.reduce((sum, score) => sum + score, 0) + PRIOR_GAMES * leagueMean) /
      (n + PRIOR_GAMES);
    // The same blend for the spread, on variances, by degrees of freedom.
    const ownVariance = n > 1 ? getStdDev(scores, getMean(scores)) ** 2 : 0;
    const stdDev = Math.sqrt(
      (Math.max(0, n - 1) * ownVariance + PRIOR_GAMES * leagueStdDev ** 2) /
        (Math.max(0, n - 1) + PRIOR_GAMES)
    );

    return {
      rosterId: roster.roster_id,
      mean,
      stdDev,
      gamesPlayed: scores.length,
    };
  });
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
      pointsFor: roster.settings.fpts + roster.settings.fpts_decimal / 100,
      pointsAgainst:
        roster.settings.fpts_against +
        roster.settings.fpts_against_decimal / 100,
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

      const team1Score = pick.team1Score || 0;
      const team2Score = pick.team2Score || 0;

      // Add points from user picks
      team1Result.pointsFor += team1Score;
      team1Result.pointsAgainst += team2Score;
      team2Result.pointsFor += team2Score;
      team2Result.pointsAgainst += team1Score;

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
  userScenario: UserScenario | undefined,
  random: Random,
  observe?: GameObserver
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
      pointsFor: roster.settings.fpts + roster.settings.fpts_decimal / 100,
      pointsAgainst:
        roster.settings.fpts_against +
        roster.settings.fpts_against_decimal / 100,
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

        team1Score = team1Stats.mean + team1Stats.stdDev * randomNormal(random);
        team2Score = team2Stats.mean + team2Stats.stdDev * randomNormal(random);
      }

      observe?.(week, team1.roster_id, team2.roster_id, team1Score, team2Score);

      // Update results
      const team1Result = results.find((r) => r.rosterId === team1.roster_id)!;
      const team2Result = results.find((r) => r.rosterId === team2.roster_id)!;

      team1Result.pointsFor += team1Score;
      team1Result.pointsAgainst += team2Score;
      team2Result.pointsFor += team2Score;
      team2Result.pointsAgainst += team1Score;

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
      const aWinPct = calculateWinPercentage(a.wins, a.losses, a.ties);
      const bWinPct = calculateWinPercentage(b.wins, b.losses, b.ties);

      if (aWinPct !== bWinPct) return bWinPct - aWinPct;
      return b.pointsFor - a.pointsFor;
    })
    .map((r) => r.rosterId);
}

/**
 * Calculate playoff odds using Monte Carlo simulation
 */
export function calculatePlayoffOdds(
  seasonData: SeasonData,
  userScenario?: UserScenario,
  random: Random = Math.random
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
      userScenario,
      random
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
      wins: updatedRecord?.wins ?? roster.settings.wins,
      losses: updatedRecord?.losses ?? roster.settings.losses,
      ties: updatedRecord?.ties ?? roster.settings.ties,
      pointsFor:
        updatedRecord?.pointsFor ??
        roster.settings.fpts + roster.settings.fpts_decimal / 100,
      pointsAgainst:
        updatedRecord?.pointsAgainst ??
        roster.settings.fpts_against +
          roster.settings.fpts_against_decimal / 100,
    });
  });

  return playoffOddsResults;
}

/** What one week's game is worth to a team, in playoff odds (K1). */
export interface WeekStakes {
  rosterId: number;
  /** Playoff odds now, as a percentage. */
  now: number;
  /** ...in the simulations where this team won that week's game. */
  ifWin: number;
  /** ...and where it lost. */
  ifLose: number;
}

/**
 * "Win and jay's playoff odds go to 71%; lose and they are 38%."
 *
 * One pass of the same simulation `calculatePlayoffOdds` runs, remembering how
 * each team's game in `week` went: the odds given a win are the share of the
 * simulations a team won that game in AND made the playoffs. That is the same
 * answer as re-running the season with the game fixed each way, in one run
 * rather than twenty-four.
 *
 * Seeded by the season and week, so a preview page and its link preview built
 * at a different time from the same data print the same numbers.
 *
 * Empty unless `week` is a regular-season week still to be played, with
 * `seasonData.matchups` including the fixtures to come (merge the schedule in
 * with `mergeScheduledMatchups`, as the Playoff Odds page does).
 */
export function calculateWeekStakes(
  seasonData: SeasonData,
  week: number,
  {
    simulations = 10000,
    seed = week,
  }: { simulations?: number; seed?: number } = {}
): WeekStakes[] {
  if (!seasonData.matchups || !seasonData.rosters || !seasonData.league) {
    return [];
  }
  const completedWeek = getCompletedWeek(seasonData.league);
  if (completedWeek === null) return [];
  const playoffWeekStart = getPlayoffWeekStart(seasonData);
  if (week <= completedWeek || week >= playoffWeekStart) return [];
  if (!seasonData.matchups[String(week)]?.length) return [];

  const playoffTeams = seasonData.league.settings?.playoff_teams || 6;
  const teamStats = calculateTeamStats(seasonData, completedWeek);
  const random = seededRandom(seed);

  const tally = new Map(
    seasonData.rosters.map((roster) => [
      roster.roster_id,
      { made: 0, won: 0, wonMade: 0, lost: 0, lostMade: 0 },
    ])
  );

  for (let i = 0; i < simulations; i++) {
    const result = new Map<number, "W" | "L">();
    const results = simulateSeason(
      seasonData,
      teamStats,
      completedWeek,
      undefined,
      random,
      (gameWeek, team1, team2, score1, score2) => {
        if (gameWeek !== week || score1 === score2) return;
        result.set(team1, score1 > score2 ? "W" : "L");
        result.set(team2, score2 > score1 ? "W" : "L");
      }
    );
    const made = new Set(rankTeamsByRecord(results).slice(0, playoffTeams));

    for (const [rosterId, counts] of tally) {
      const inPlayoffs = made.has(rosterId);
      if (inPlayoffs) counts.made++;
      const outcome = result.get(rosterId);
      if (outcome === "W") {
        counts.won++;
        if (inPlayoffs) counts.wonMade++;
      } else if (outcome === "L") {
        counts.lost++;
        if (inPlayoffs) counts.lostMade++;
      }
    }
  }

  const percent = (part: number, whole: number) =>
    whole === 0 ? 0 : (part / whole) * 100;

  return [...tally].map(([rosterId, counts]) => ({
    rosterId,
    now: percent(counts.made, simulations),
    ifWin: percent(counts.wonMade, counts.won),
    ifLose: percent(counts.lostMade, counts.lost),
  }));
}
