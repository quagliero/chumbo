import { CURRENT_YEAR } from "@/domain/constants";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import {
  getPlayoffWeekStart,
  isPlayoffWeek,
  isRegularSeasonWeek,
  isMeaningfulPlayoffGame,
} from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import {
  getRosterPointsFor,
  getRosterPointsAgainst,
  determineMatchupResult,
  calculateLeagueRecord,
} from "@/utils/recordUtils";
import {
  getChampionshipResult,
  getSeasonPlacement,
  madePlayoffs,
} from "./seasonAchievements";
import type { DataMode, SeasonData, SeasonStats } from "./types";

/** The running win/loss/points contribution of a single season. */
export interface SeasonTotals {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

const EMPTY_TOTALS: SeasonTotals = {
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
};

/** Find a manager's roster in a season, by their Sleeper owner id. */
export const findManagerRoster = (
  seasonData: SeasonData,
  sleeperOwnerId: string
): ExtendedRoster | undefined =>
  seasonData.rosters.find((r: ExtendedRoster) => r.owner_id === sleeperOwnerId);

/**
 * Walk a season's weeks and total up the games the caller cares about.
 *
 * `includeGame` is applied once the manager's matchup for the week has been
 * found, so it can look at the matchup as well as the week number.
 */
const sumMatchupRecord = (
  roster: ExtendedRoster,
  seasonData: SeasonData,
  includeGame: (weekNum: number, teamMatchup: ExtendedMatchup) => boolean
): SeasonTotals => {
  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);
    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;
    if (!includeGame(weekNum, teamMatchup)) return;

    pointsFor += teamMatchup.points;

    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );

    if (opponentMatchup) {
      pointsAgainst += opponentMatchup.points;

      const result = determineMatchupResult(
        teamMatchup.points,
        opponentMatchup.points
      );
      if (result === "W") wins++;
      else if (result === "L") losses++;
      else ties++;
    }
  });

  return { wins, losses, ties, pointsFor, pointsAgainst };
};

/** Regular season-only record for a season. */
export const getRegularSeasonStats = (
  roster: ExtendedRoster | undefined,
  seasonData: SeasonData
): SeasonTotals => {
  if (!roster) return { ...EMPTY_TOTALS };

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  return sumMatchupRecord(
    roster,
    seasonData,
    (weekNum) => !isPlayoffWeek(weekNum, playoffWeekStart)
  );
};

/** Playoff-only record for a season — meaningful winners-bracket games only. */
export const getPlayoffStats = (
  roster: ExtendedRoster | undefined,
  seasonData: SeasonData
): SeasonTotals => {
  if (!roster) return { ...EMPTY_TOTALS };

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  return sumMatchupRecord(
    roster,
    seasonData,
    (weekNum, teamMatchup) =>
      !isRegularSeasonWeek(weekNum, playoffWeekStart) &&
      isMeaningfulPlayoffGame(
        teamMatchup,
        seasonData,
        weekNum,
        playoffWeekStart
      )
  );
};

/**
 * What a single season contributes to a manager's all-time totals.
 *
 * Note that the three data modes do not agree on where the numbers come from:
 * "regular" trusts Sleeper's roster settings (the same source as AllTimeTable),
 * while "playoffs" and "combined" re-derive them from the matchups.
 */
export const getSeasonTotals = (
  roster: ExtendedRoster,
  seasonData: SeasonData,
  seasonStat: SeasonStats,
  dataMode: DataMode
): SeasonTotals => {
  if (dataMode === "playoffs") {
    return {
      wins: seasonStat.wins,
      losses: seasonStat.losses,
      ties: seasonStat.ties,
      pointsFor: seasonStat.pointsFor,
      pointsAgainst: seasonStat.pointsAgainst,
    };
  }

  if (dataMode === "regular") {
    return {
      wins: roster.settings?.wins || 0,
      losses: roster.settings?.losses || 0,
      ties: roster.settings?.ties || 0,
      pointsFor: getRosterPointsFor(roster),
      pointsAgainst: getRosterPointsAgainst(roster),
    };
  }

  // Combined: regular season + playoffs, both re-derived from the matchups.
  const regular = getRegularSeasonStats(roster, seasonData);
  const playoffs = getPlayoffStats(roster, seasonData);

  return {
    wins: regular.wins + playoffs.wins,
    losses: regular.losses + playoffs.losses,
    ties: regular.ties + playoffs.ties,
    pointsFor: regular.pointsFor + playoffs.pointsFor,
    pointsAgainst: regular.pointsAgainst + playoffs.pointsAgainst,
  };
};

/**
 * Calculate stats for a specific season
 */
export const getSeasonStats = (
  managerId: string,
  year: number,
  seasonData: SeasonData,
  dataMode: DataMode = "regular"
): SeasonStats | null => {
  const roster = findManagerRoster(seasonData, managerId);
  if (!roster) return null;

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;
  let leagueWins = 0,
    leagueLosses = 0,
    leagueTies = 0;

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Filter weeks based on data mode
    if (dataMode === "regular" && isPlayoffWeek(weekNum, playoffWeekStart))
      return; // Skip playoff weeks
    if (
      dataMode === "playoffs" &&
      isRegularSeasonWeek(weekNum, playoffWeekStart)
    )
      return; // Skip regular season weeks

    // Only process completed weeks for regular season
    // For historical seasons (before current year), assume all weeks are completed
    if (
      dataMode === "regular" &&
      year === CURRENT_YEAR &&
      !isWeekCompleted(weekNum, seasonData.league)
    ) {
      return;
    }

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;

    // For playoffs mode, only include games that are in winners_bracket and are meaningful
    if (
      dataMode === "playoffs" &&
      isPlayoffWeek(weekNum, playoffWeekStart) &&
      !isMeaningfulPlayoffGame(
        teamMatchup,
        seasonData,
        weekNum,
        playoffWeekStart
      )
    )
      return;

    pointsFor += teamMatchup.points;

    // Find opponent
    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );

    if (opponentMatchup) {
      pointsAgainst += opponentMatchup.points;

      const result = determineMatchupResult(
        teamMatchup.points,
        opponentMatchup.points
      );
      if (result === "W") wins++;
      else if (result === "L") losses++;
      else ties++;
    }

    // Calculate league-wide performance
    const leagueRecord = calculateLeagueRecord(teamMatchup, weekMatchups);
    leagueWins += leagueRecord.leagueWins;
    leagueLosses += leagueRecord.leagueLosses;
    leagueTies += leagueRecord.leagueTies;
  });

  const { finalStanding, pointsStanding, scoringCrown } = getSeasonPlacement(
    seasonData,
    roster
  );

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
    pointsStanding,
    championshipResult: getChampionshipResult(seasonData, roster),
    scoringCrown,
    madePlayoffs: madePlayoffs(seasonData, roster.roster_id),
  };
};
