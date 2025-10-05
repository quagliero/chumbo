import { ExtendedMatchup } from "../../types/matchup";

export interface RecordStats {
  wins: number;
  losses: number;
  ties: number;
}

export interface StreakStats {
  streak: number;
  streakType: "W" | "L" | null;
}

/**
 * Calculate a team's record up to a specific week
 * @param rosterId - The roster ID to calculate record for
 * @param allMatchups - All matchup data organized by week
 * @param week - The week to calculate up to (exclusive)
 * @returns Record statistics
 */
export const getRecordUpToWeek = (
  rosterId: number,
  allMatchups: Record<string, ExtendedMatchup[]>,
  week: number
): RecordStats => {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  Object.keys(allMatchups)
    .map(Number)
    .filter((w) => w < week)
    .forEach((w) => {
      const weekMatchups = allMatchups[w.toString()];
      const teamMatchup = weekMatchups.find((m) => m.roster_id === rosterId);
      if (teamMatchup) {
        const opponentMatchup = weekMatchups.find(
          (m) =>
            m.matchup_id === teamMatchup.matchup_id && m.roster_id !== rosterId
        );
        if (opponentMatchup) {
          if (teamMatchup.points > opponentMatchup.points) wins++;
          else if (teamMatchup.points < opponentMatchup.points) losses++;
          else ties++;
        }
      }
    });

  return { wins, losses, ties };
};

/**
 * Calculate a team's current streak up to a specific week
 * @param rosterId - The roster ID to calculate streak for
 * @param allMatchups - All matchup data organized by week
 * @param week - The week to calculate up to (exclusive)
 * @returns Streak statistics
 */
export const getCurrentStreak = (
  rosterId: number,
  allMatchups: Record<string, ExtendedMatchup[]>,
  week: number
): StreakStats => {
  const weeks = Object.keys(allMatchups)
    .map(Number)
    .filter((w) => w < week)
    .sort((a, b) => b - a); // Reverse order

  let streak = 0;
  let streakType: "W" | "L" | null = null;

  for (const w of weeks) {
    const weekMatchups = allMatchups[w.toString()];
    const teamMatchup = weekMatchups.find((m) => m.roster_id === rosterId);
    if (teamMatchup) {
      const opponentMatchup = weekMatchups.find(
        (m) =>
          m.matchup_id === teamMatchup.matchup_id && m.roster_id !== rosterId
      );
      if (opponentMatchup) {
        const won = teamMatchup.points > opponentMatchup.points;
        const lost = teamMatchup.points < opponentMatchup.points;

        if (streakType === null) {
          streakType = won ? "W" : lost ? "L" : null;
          streak = 1;
        } else if (
          (streakType === "W" && won) ||
          (streakType === "L" && lost)
        ) {
          streak++;
        } else {
          break;
        }
      }
    }
  }

  return { streak, streakType };
};
