import { seasons } from "../data";
import { YEARS } from "../domain/constants";
import { ExtendedMatchup } from "../types/matchup";
import { ExtendedRoster } from "../types/roster";
import { BracketMatch } from "../types/bracket";

export type DataMode = "regular" | "playoffs" | "combined";

export interface ManagerStats {
  managerId: string;
  managerName: string;
  teamName: string;

  // Overall records
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPointsFor: number;
  totalPointsAgainst: number;

  // League-wide performance (vs everyone each week)
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;

  // Per-season breakdown
  seasonStats: SeasonStats[];

  // H2H records against other managers
  h2hRecords: Record<string, H2HRecord>;

  // Achievements
  championships: number;
  runnerUps: number;
  thirdPlace: number;
  scoringCrowns: number;
  firstPlaceStandings: number;

  // Best seasons
  bestWinsSeason: { year: number; wins: number };
  bestPointsSeason: { year: number; points: number };
}

export interface SeasonStats {
  year: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;
  finalStanding: number;
  championshipResult?: "champion" | "runner-up" | "third-place";
  scoringCrown?: boolean;
}

export interface H2HRecord {
  managerId: string;
  managerName: string;
  wins: number;
  losses: number;
  ties: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
}

/**
 * Calculate comprehensive manager statistics
 */
export const getManagerStats = (
  managerId: string,
  dataMode: DataMode = "regular"
): ManagerStats | null => {
  const manager = managers.find((m) => m.id === managerId);
  if (!manager) return null;

  const seasonStats: SeasonStats[] = [];
  let totalWins = 0,
    totalLosses = 0,
    totalTies = 0;
  let totalPointsFor = 0,
    totalPointsAgainst = 0;
  let leagueWins = 0,
    leagueLosses = 0,
    leagueTies = 0;
  let championships = 0,
    runnerUps = 0,
    thirdPlace = 0;
  let scoringCrowns = 0,
    firstPlaceStandings = 0;

  const h2hRecords: Record<string, H2HRecord> = {};
  let bestWinsSeason = { year: 0, wins: 0 };
  let bestPointsSeason = { year: 0, points: 0 };

  // Process each season
  YEARS.forEach((year) => {
    const seasonData = seasons[year];
    if (!seasonData?.rosters || !seasonData?.matchups) return;

    const roster = seasonData.rosters.find(
      (r) => r.owner_id === manager.sleeper.id
    );
    if (!roster) return;

    const seasonStat = getSeasonStats(
      manager.sleeper.id,
      year,
      seasonData,
      dataMode
    );
    if (!seasonStat) return;

    seasonStats.push(seasonStat);

    // Use appropriate calculation based on data mode
    if (dataMode === "playoffs") {
      // For playoffs only, use calculated stats
      totalWins += seasonStat.wins;
      totalLosses += seasonStat.losses;
      totalTies += seasonStat.ties;
      totalPointsFor += seasonStat.pointsFor;
      totalPointsAgainst += seasonStat.pointsAgainst;
    } else if (dataMode === "regular") {
      // For regular season only, use roster settings totals (same as AllTimeTable)
      totalWins += roster.settings?.wins || 0;
      totalLosses += roster.settings?.losses || 0;
      totalTies += roster.settings?.ties || 0;

      const rosterPointsFor =
        (roster.settings?.fpts || 0) +
        (roster.settings?.fpts_decimal || 0) / 100;
      const rosterPointsAgainst =
        (roster.settings?.fpts_against || 0) +
        (roster.settings?.fpts_against_decimal || 0) / 100;

      totalPointsFor += rosterPointsFor;
      totalPointsAgainst += rosterPointsAgainst;
    } else {
      // For combined, calculate regular season + playoff stats separately
      const regularSeasonStats = getRegularSeasonStats(
        manager.sleeper.id,
        year,
        seasonData
      );
      const playoffStats = getPlayoffStats(
        manager.sleeper.id,
        year,
        seasonData
      );

      totalWins += regularSeasonStats.wins + playoffStats.wins;
      totalLosses += regularSeasonStats.losses + playoffStats.losses;
      totalTies += regularSeasonStats.ties + playoffStats.ties;
      totalPointsFor += regularSeasonStats.pointsFor + playoffStats.pointsFor;
      totalPointsAgainst +=
        regularSeasonStats.pointsAgainst + playoffStats.pointsAgainst;
    }
    leagueWins += seasonStat.leagueWins;
    leagueLosses += seasonStat.leagueLosses;
    leagueTies += seasonStat.leagueTies;

    // Track achievements
    if (seasonStat.championshipResult === "champion") championships++;
    if (seasonStat.championshipResult === "runner-up") runnerUps++;
    if (seasonStat.championshipResult === "third-place") thirdPlace++;
    if (seasonStat.scoringCrown) scoringCrowns++;
    if (seasonStat.finalStanding === 1) firstPlaceStandings++;

    // Track best seasons
    if (seasonStat.wins > bestWinsSeason.wins) {
      bestWinsSeason = { year, wins: seasonStat.wins };
    }
    if (seasonStat.pointsFor > bestPointsSeason.points) {
      bestPointsSeason = { year, points: seasonStat.pointsFor };
    }
  });

  // Calculate H2H records
  YEARS.forEach((year) => {
    const seasonData = seasons[year];
    if (!seasonData?.rosters || !seasonData?.matchups) return;

    const roster = seasonData.rosters.find(
      (r) => r.owner_id === manager.sleeper.id
    );
    if (!roster) return;

    calculateH2HForSeason(
      manager.sleeper.id,
      year,
      seasonData,
      h2hRecords,
      dataMode
    );
  });

  return {
    managerId,
    managerName: manager.name,
    teamName: manager.teamName,
    totalWins,
    totalLosses,
    totalTies,
    totalPointsFor,
    totalPointsAgainst,
    leagueWins,
    leagueLosses,
    leagueTies,
    seasonStats,
    h2hRecords,
    championships,
    runnerUps,
    thirdPlace,
    scoringCrowns,
    firstPlaceStandings,
    bestWinsSeason,
    bestPointsSeason,
  };
};

/**
 * Calculate stats for a specific season
 */
const getSeasonStats = (
  managerId: string,
  year: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any, // TODO: Add proper SeasonData type
  dataMode: DataMode = "regular"
): SeasonStats | null => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster) return null;

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;
  let leagueWins = 0,
    leagueLosses = 0,
    leagueTies = 0;

  // Calculate record based on data mode
  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);
    const playoffWeekStart =
      seasonData.league?.settings?.playoff_week_start || 15;

    // Filter weeks based on data mode
    if (dataMode === "regular" && weekNum >= playoffWeekStart) return; // Skip playoff weeks
    if (dataMode === "playoffs" && weekNum < playoffWeekStart) return; // Skip regular season weeks

    // For playoffs mode, only include games that are in winners_bracket and are meaningful
    if (dataMode === "playoffs" && weekNum >= playoffWeekStart) {
      const weekMatchups = seasonData.matchups[weekKey];
      const teamMatchup = weekMatchups.find(
        (m: ExtendedMatchup) => m.roster_id === roster.roster_id
      );

      if (!teamMatchup) return;

      // Check if this matchup is in winners_bracket and is meaningful (elimination or championship)
      const bracketMatch = seasonData.winners_bracket?.find(
        (bm: BracketMatch) =>
          (bm.t1 === teamMatchup.roster_id ||
            bm.t2 === teamMatchup.roster_id) &&
          bm.r === weekNum - playoffWeekStart + 1 // Convert week to round number
      );

      // Only include if it's in winners_bracket and is either elimination (no p property) or championship (p: 1)
      if (!bracketMatch || (bracketMatch.p && bracketMatch.p !== 1)) return;
    }

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (teamMatchup) {
      pointsFor += teamMatchup.points;

      // Find opponent
      const opponentMatchup = weekMatchups.find(
        (m: ExtendedMatchup) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== roster.roster_id
      );

      if (opponentMatchup) {
        pointsAgainst += opponentMatchup.points;

        if (teamMatchup.points > opponentMatchup.points) wins++;
        else if (teamMatchup.points < opponentMatchup.points) losses++;
        else ties++;
      }

      // Calculate league-wide performance
      const allScores = weekMatchups.map((m: ExtendedMatchup) => m.points);
      const betterScores = allScores.filter(
        (score: number) => score > teamMatchup.points
      ).length;
      const worseScores = allScores.filter(
        (score: number) => score < teamMatchup.points
      ).length;
      const sameScores =
        allScores.filter((score: number) => score === teamMatchup.points)
          .length - 1; // -1 for self

      leagueWins += worseScores;
      leagueLosses += betterScores;
      leagueTies += sameScores;
    }
  });

  // Calculate final standing
  const standings = seasonData.rosters
    .map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      wins: r.settings?.wins || 0,
      losses: r.settings?.losses || 0,
      ties: r.settings?.ties || 0,
      pointsFor:
        (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => {
      // TODO: Add proper type for standings
      const aWinPct = a.wins / (a.wins + a.losses + a.ties);
      const bWinPct = b.wins / (b.wins + b.losses + b.ties);
      if (aWinPct !== bWinPct) return bWinPct - aWinPct;
      return b.pointsFor - a.pointsFor;
    });

  const finalStanding =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standings.findIndex((s: any) => s.rosterId === roster.roster_id) + 1; // TODO: Add proper type

  // Check championship results
  let championshipResult: "champion" | "runner-up" | "third-place" | undefined;
  if (seasonData.winners_bracket) {
    const championship = seasonData.winners_bracket.find(
      (m: BracketMatch) => m.p === 1
    );
    const thirdPlace = seasonData.winners_bracket.find(
      (m: BracketMatch) => m.p === 2
    );

    if (championship?.w === roster.roster_id) championshipResult = "champion";
    else if (
      championship?.t1 === roster.roster_id ||
      championship?.t2 === roster.roster_id
    )
      championshipResult = "runner-up";
    else if (thirdPlace?.w === roster.roster_id)
      championshipResult = "third-place";
  }

  // Check scoring crown - team with highest total points
  const allTeamsByPoints = seasonData.rosters
    .map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      pointsFor:
        (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => b.pointsFor - a.pointsFor);

  const scoringCrown = allTeamsByPoints[0]?.rosterId === roster.roster_id;

  return {
    year,
    wins,
    losses,
    ties,
    pointsFor,
    pointsAgainst,
    leagueWins,
    leagueLosses,
    leagueTies,
    finalStanding,
    championshipResult,
    scoringCrown,
  };
};

/**
 * Calculate regular season-only stats for a season
 */
const getRegularSeasonStats = (
  managerId: string,
  year: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any
) => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster)
    return { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

  const playoffWeekStart =
    seasonData.league?.settings?.playoff_week_start || 15;

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Only include regular season weeks
    if (weekNum >= playoffWeekStart) return;

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;

    pointsFor += teamMatchup.points;

    // Find opponent
    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );

    if (opponentMatchup) {
      pointsAgainst += opponentMatchup.points;

      if (teamMatchup.points > opponentMatchup.points) wins++;
      else if (teamMatchup.points < opponentMatchup.points) losses++;
      else ties++;
    }
  });

  return { wins, losses, ties, pointsFor, pointsAgainst };
};

/**
 * Calculate playoff-only stats for a season
 */
const getPlayoffStats = (
  managerId: string,
  year: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any
) => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster)
    return { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

  const playoffWeekStart =
    seasonData.league?.settings?.playoff_week_start || 15;

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Only include playoff weeks
    if (weekNum < playoffWeekStart) return;

    // Only include games that are in winners_bracket and are meaningful
    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;

    // Check if this matchup is in winners_bracket and is meaningful (elimination or championship)
    const bracketMatch = seasonData.winners_bracket?.find(
      (bm: BracketMatch) =>
        (bm.t1 === teamMatchup.roster_id || bm.t2 === teamMatchup.roster_id) &&
        bm.r === weekNum - playoffWeekStart + 1 // Convert week to round number
    );

    // Only include if it's in winners_bracket and is either elimination (no p property) or championship (p: 1)
    if (!bracketMatch || (bracketMatch.p && bracketMatch.p !== 1)) return;

    pointsFor += teamMatchup.points;

    // Find opponent
    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );

    if (opponentMatchup) {
      pointsAgainst += opponentMatchup.points;

      if (teamMatchup.points > opponentMatchup.points) wins++;
      else if (teamMatchup.points < opponentMatchup.points) losses++;
      else ties++;
    }
  });

  return { wins, losses, ties, pointsFor, pointsAgainst };
};

/**
 * Calculate H2H records for a season
 */
const calculateH2HForSeason = (
  managerId: string,
  year: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any, // TODO: Add proper SeasonData type
  h2hRecords: Record<string, H2HRecord>,
  dataMode: DataMode = "regular"
) => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster) return;

  const playoffWeekStart =
    seasonData.league?.settings?.playoff_week_start || 15;

  // Use year parameter to avoid warning
  console.debug(
    `Calculating H2H for ${managerId} in ${year}, dataMode: ${dataMode}`
  );

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Filter weeks based on data mode
    if (dataMode === "regular" && weekNum >= playoffWeekStart) return; // Skip playoff weeks
    if (dataMode === "playoffs" && weekNum < playoffWeekStart) return; // Skip regular season weeks

    // For playoffs mode, only include games that are in winners_bracket and are meaningful
    if (dataMode === "playoffs" && weekNum >= playoffWeekStart) {
      const weekMatchups = seasonData.matchups[weekKey];
      const teamMatchup = weekMatchups.find(
        (m: ExtendedMatchup) => m.roster_id === roster.roster_id
      );

      if (!teamMatchup) return;

      // Check if this matchup is in winners_bracket and is meaningful (elimination or championship)
      const bracketMatch = seasonData.winners_bracket?.find(
        (bm: BracketMatch) =>
          (bm.t1 === teamMatchup.roster_id ||
            bm.t2 === teamMatchup.roster_id) &&
          bm.r === weekNum - playoffWeekStart + 1 // Convert week to round number
      );

      // Only include if it's in winners_bracket and is either elimination (no p property) or championship (p: 1)
      if (!bracketMatch || (bracketMatch.p && bracketMatch.p !== 1)) return;
    }

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (teamMatchup) {
      const opponentMatchup = weekMatchups.find(
        (m: ExtendedMatchup) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== roster.roster_id
      );

      if (opponentMatchup) {
        const opponentRoster = seasonData.rosters.find(
          (r: ExtendedRoster) => r.roster_id === opponentMatchup.roster_id
        );
        if (!opponentRoster) return;

        const opponentManager = managers.find(
          (m) => m.sleeper.id === opponentRoster.owner_id
        );
        if (!opponentManager) return;

        const opponentId = opponentRoster.owner_id;

        if (!h2hRecords[opponentId]) {
          h2hRecords[opponentId] = {
            managerId: opponentId,
            managerName: opponentManager.name,
            wins: 0,
            losses: 0,
            ties: 0,
            avgPointsFor: 0,
            avgPointsAgainst: 0,
          };
        }

        const record = h2hRecords[opponentId];

        if (teamMatchup.points > opponentMatchup.points) record.wins++;
        else if (teamMatchup.points < opponentMatchup.points) record.losses++;
        else record.ties++;

        record.avgPointsFor += teamMatchup.points;
        record.avgPointsAgainst += opponentMatchup.points;
      }
    }
  });
};

// Import managers at the top
import managers from "../data/managers.json";
