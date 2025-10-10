import { YEARS } from "@/domain/constants";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { ExtendedMatchup } from "@/types/matchup";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { determineMatchupResult } from "@/utils/recordUtils";

interface SeasonData {
  matchups?: Record<string, ExtendedMatchup[]>;
  league?: {
    settings?: {
      playoff_week_start?: number;
    };
  };
  year?: number;
}

export interface H2HMatchupRecord {
  team1Wins: number;
  team2Wins: number;
  ties: number;
  team1AvgPoints: number;
  team2AvgPoints: number;
}

export interface H2HGame {
  year: number;
  week: number;
  result: "W" | "L" | "T";
  pointsFor: number;
  pointsAgainst: number;
}

export interface H2HRecordWithGames extends H2HMatchupRecord {
  games: H2HGame[];
}

/**
 * Calculate all-time head-to-head record between two teams (regular season only)
 * @param team1OwnerId - Sleeper owner ID for team 1
 * @param team2OwnerId - Sleeper owner ID for team 2
 * @returns H2H record with wins, losses, ties, and average points
 */
export const getAllTimeH2HRecord = (
  team1OwnerId: string,
  team2OwnerId: string
): H2HMatchupRecord => {
  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;
  let team1TotalPoints = 0;
  let team2TotalPoints = 0;
  let matchupCount = 0;

  // Get sleeper IDs for both teams
  const team1Manager = managers.find((m) => m.sleeper.id === team1OwnerId);
  const team2Manager = managers.find((m) => m.sleeper.id === team2OwnerId);

  if (!team1Manager || !team2Manager) {
    return {
      team1Wins: 0,
      team2Wins: 0,
      ties: 0,
      team1AvgPoints: 0,
      team2AvgPoints: 0,
    };
  }

  // Loop through all years
  YEARS.forEach((yr) => {
    const seasonData = seasons[yr];
    if (!seasonData?.matchups || !seasonData?.rosters || !seasonData?.league)
      return;

    // Get playoff start week for this year
    const playoffWeekStart = getPlayoffWeekStart(seasonData);

    // Find the roster_ids for both managers in this year
    const team1RosterInYear = seasonData.rosters.find(
      (r) => r.owner_id === team1Manager.sleeper.id
    );
    const team2RosterInYear = seasonData.rosters.find(
      (r) => r.owner_id === team2Manager.sleeper.id
    );

    if (!team1RosterInYear || !team2RosterInYear) return;

    // Loop through all matchup weeks (regular season only)
    Object.keys(seasonData.matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);

      // Skip playoff weeks
      if (weekNum >= playoffWeekStart) return;

      const weekMatchups =
        seasonData.matchups[weekKey as keyof typeof seasonData.matchups];
      if (!weekMatchups) return;

      const team1Match = weekMatchups.find(
        (m) => m.roster_id === team1RosterInYear.roster_id
      );
      const team2Match = weekMatchups.find(
        (m) => m.roster_id === team2RosterInYear.roster_id
      );

      // Check if these two teams played each other this week
      if (
        team1Match &&
        team2Match &&
        team1Match.matchup_id === team2Match.matchup_id
      ) {
        matchupCount++;
        team1TotalPoints += team1Match.points;
        team2TotalPoints += team2Match.points;

        const result = determineMatchupResult(
          team1Match.points,
          team2Match.points
        );
        if (result === "W") team1Wins++;
        else if (result === "L") team2Wins++;
        else ties++;
      }
    });
  });

  return {
    team1Wins,
    team2Wins,
    ties,
    team1AvgPoints: matchupCount > 0 ? team1TotalPoints / matchupCount : 0,
    team2AvgPoints: matchupCount > 0 ? team2TotalPoints / matchupCount : 0,
  };
};

/**
 * Calculate H2H record for a single season between two teams
 * @param team1RosterId - First team's roster ID
 * @param team2RosterId - Second team's roster ID
 * @param seasonData - Season data containing matchups
 * @returns H2H record with wins, losses, ties, and average points
 */
export const getH2HRecordForSeason = (
  team1RosterId: number,
  team2RosterId: number,
  seasonData: SeasonData
): H2HMatchupRecord => {
  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;
  let team1TotalPoints = 0;
  let team2TotalPoints = 0;
  let matchupCount = 0;

  if (!seasonData?.matchups) {
    return {
      team1Wins: 0,
      team2Wins: 0,
      ties: 0,
      team1AvgPoints: 0,
      team2AvgPoints: 0,
    };
  }

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Skip playoff weeks
    if (weekNum >= playoffWeekStart) return;

    const weekMatchups = seasonData.matchups?.[weekKey];
    if (!weekMatchups) return;

    const team1Match = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === team1RosterId
    );
    const team2Match = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === team2RosterId
    );

    // Check if these two teams played each other this week
    if (
      team1Match &&
      team2Match &&
      team1Match.matchup_id === team2Match.matchup_id
    ) {
      matchupCount++;
      team1TotalPoints += team1Match.points;
      team2TotalPoints += team2Match.points;

      const result = determineMatchupResult(
        team1Match.points,
        team2Match.points
      );
      if (result === "W") team1Wins++;
      else if (result === "L") team2Wins++;
      else ties++;
    }
  });

  return {
    team1Wins,
    team2Wins,
    ties,
    team1AvgPoints: matchupCount > 0 ? team1TotalPoints / matchupCount : 0,
    team2AvgPoints: matchupCount > 0 ? team2TotalPoints / matchupCount : 0,
  };
};

/**
 * Calculate H2H record with individual game details
 * @param team1RosterId - First team's roster ID
 * @param team2RosterId - Second team's roster ID
 * @param seasonData - Season data containing matchups
 * @returns H2H record with individual game details
 */
export const getH2HRecordWithGames = (
  team1RosterId: number,
  team2RosterId: number,
  seasonData: SeasonData
): H2HRecordWithGames => {
  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;
  let team1TotalPoints = 0;
  let team2TotalPoints = 0;
  let matchupCount = 0;
  const games: H2HGame[] = [];

  if (!seasonData?.matchups) {
    return {
      team1Wins: 0,
      team2Wins: 0,
      ties: 0,
      team1AvgPoints: 0,
      team2AvgPoints: 0,
      games: [],
    };
  }

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Skip playoff weeks
    if (weekNum >= playoffWeekStart) return;

    const weekMatchups = seasonData.matchups?.[weekKey];
    if (!weekMatchups) return;

    const team1Match = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === team1RosterId
    );
    const team2Match = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === team2RosterId
    );

    // Check if these two teams played each other this week
    if (
      team1Match &&
      team2Match &&
      team1Match.matchup_id === team2Match.matchup_id
    ) {
      matchupCount++;
      team1TotalPoints += team1Match.points;
      team2TotalPoints += team2Match.points;

      const result = determineMatchupResult(
        team1Match.points,
        team2Match.points
      );
      if (result === "W") team1Wins++;
      else if (result === "L") team2Wins++;
      else ties++;

      // Add game details
      games.push({
        year: seasonData.year || new Date().getFullYear(),
        week: weekNum,
        result,
        pointsFor: team1Match.points,
        pointsAgainst: team2Match.points,
      });
    }
  });

  return {
    team1Wins,
    team2Wins,
    ties,
    team1AvgPoints: matchupCount > 0 ? team1TotalPoints / matchupCount : 0,
    team2AvgPoints: matchupCount > 0 ? team2TotalPoints / matchupCount : 0,
    games,
  };
};

/**
 * Calculate current streak between two teams
 * @param games - Array of H2H games sorted by most recent first
 * @returns Current streak information
 */
export const calculateH2HStreak = (
  games: H2HGame[]
): { type: "W" | "L" | "T"; count: number } => {
  if (games.length === 0) {
    return { type: "T", count: 0 };
  }

  const mostRecentResult = games[0].result;
  let count = 1;

  for (let i = 1; i < games.length; i++) {
    if (games[i].result === mostRecentResult) {
      count++;
    } else {
      break;
    }
  }

  return { type: mostRecentResult, count };
};
