import { ExtendedLeague } from "@/types/league";

/**
 * Get the most recent completed week for a league
 * @param league - The league data
 * @returns The most recent completed week number, or null if season is finished
 */
export const getCompletedWeek = (
  league: ExtendedLeague | undefined
): number | null => {
  if (!league) return null;

  // If leg is not present, the season is finished
  if (!league.settings?.leg) return null;

  // Use last_scored_leg if available, otherwise use leg - 1
  // leg represents the current week, so completed week is leg - 1
  const lastScoredLeg = league.settings.last_scored_leg;
  const currentLeg = league.settings.leg;

  if (lastScoredLeg) {
    return lastScoredLeg;
  }

  // If no last_scored_leg, assume current week - 1 is completed
  return currentLeg > 1 ? currentLeg - 1 : null;
};

/**
 * Check if a week is completed
 * @param week - The week number to check
 * @param league - The league data
 * @returns True if the week is completed
 */
export const isWeekCompleted = (
  week: number,
  league: ExtendedLeague | undefined
): boolean => {
  const completedWeek = getCompletedWeek(league);

  // If completedWeek is null, it means either:
  // 1. No league data (return false)
  // 2. Pre-2019 season without leg field (assume all weeks completed)
  if (completedWeek === null) {
    // If we have league data but no leg field, it's a historical season
    // All weeks in historical seasons should be considered completed
    return league !== undefined;
  }

  return week <= completedWeek;
};
