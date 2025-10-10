import { ExtendedMatchup } from "@/types/matchup";
import { BracketMatch } from "@/types/bracket";

interface SeasonData {
  league?: {
    settings?: {
      playoff_week_start?: number;
    };
  };
  winners_bracket?: BracketMatch[];
}

/**
 * Get the playoff week start for a season, with default fallback
 * @param seasonData - The season data containing league settings
 * @returns The week number when playoffs start (default: 15)
 */
export const getPlayoffWeekStart = (seasonData: SeasonData): number => {
  return seasonData?.league?.settings?.playoff_week_start || 15;
};

/**
 * Check if a given week is a playoff week
 * @param week - The week number to check
 * @param playoffWeekStart - The week when playoffs start
 * @returns True if the week is a playoff week
 */
export const isPlayoffWeek = (
  week: number,
  playoffWeekStart: number
): boolean => {
  return week >= playoffWeekStart;
};

/**
 * Check if a given week is a regular season week
 * @param week - The week number to check
 * @param playoffWeekStart - The week when playoffs start
 * @returns True if the week is a regular season week
 */
export const isRegularSeasonWeek = (
  week: number,
  playoffWeekStart: number
): boolean => {
  return week < playoffWeekStart;
};

/**
 * Determine if a playoff game is meaningful (elimination or championship, not consolation)
 * @param matchup - The matchup to check
 * @param seasonData - The season data containing winners bracket
 * @param week - The week number
 * @param playoffWeekStart - The week when playoffs start
 * @returns True if the game is meaningful (elimination or championship)
 */
export const isMeaningfulPlayoffGame = (
  matchup: ExtendedMatchup,
  seasonData: SeasonData,
  week: number,
  playoffWeekStart: number
): boolean => {
  if (!seasonData?.winners_bracket) return false;

  // Check if this matchup is in winners_bracket and is meaningful (elimination or championship)
  const bracketMatch = seasonData.winners_bracket.find(
    (bm: BracketMatch) =>
      (bm.t1 === matchup.roster_id || bm.t2 === matchup.roster_id) &&
      bm.r === week - playoffWeekStart + 1 // Convert week to round number
  );

  // Only include if it's in winners_bracket and is either elimination (no p property) or championship (p: 1)
  return !!(bracketMatch && (!bracketMatch.p || bracketMatch.p === 1));
};

/**
 * Filter matchups to only include regular season games
 * @param matchups - Object with week keys and matchup arrays
 * @param seasonData - The season data containing league settings
 * @returns Filtered matchups object with only regular season weeks
 */
export const filterRegularSeasonMatchups = (
  matchups: Record<string, ExtendedMatchup[]>,
  seasonData: SeasonData
): Record<string, ExtendedMatchup[]> => {
  const playoffWeekStart = getPlayoffWeekStart(seasonData);
  const filtered: Record<string, ExtendedMatchup[]> = {};

  Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
    const week = parseInt(weekStr);
    if (isRegularSeasonWeek(week, playoffWeekStart)) {
      filtered[weekStr] = weekMatchups;
    }
  });

  return filtered;
};

/**
 * Filter matchups to only include meaningful playoff games
 * @param matchups - Object with week keys and matchup arrays
 * @param seasonData - The season data containing league settings and winners bracket
 * @returns Filtered matchups object with only meaningful playoff weeks
 */
export const filterMeaningfulPlayoffMatchups = (
  matchups: Record<string, ExtendedMatchup[]>,
  seasonData: SeasonData
): Record<string, ExtendedMatchup[]> => {
  const playoffWeekStart = getPlayoffWeekStart(seasonData);
  const filtered: Record<string, ExtendedMatchup[]> = {};

  Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
    const week = parseInt(weekStr);
    if (isPlayoffWeek(week, playoffWeekStart)) {
      // Check if this week has any meaningful playoff games
      const hasMeaningfulPlayoffGame = weekMatchups.some((matchup) =>
        isMeaningfulPlayoffGame(matchup, seasonData, week, playoffWeekStart)
      );

      if (hasMeaningfulPlayoffGame) {
        filtered[weekStr] = weekMatchups;
      }
    }
  });

  return filtered;
};
