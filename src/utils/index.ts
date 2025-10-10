/**
 * Utility Functions Index
 *
 * This file provides a centralized export point for all utility functions
 * to make imports cleaner and more consistent across the application.
 */

// Playoff utilities
export {
  getPlayoffWeekStart,
  isPlayoffWeek,
  isRegularSeasonWeek,
  isMeaningfulPlayoffGame,
  filterRegularSeasonMatchups,
  filterMeaningfulPlayoffMatchups,
} from "@/utils/playoffUtils";

// Manager utilities
export {
  getManagerAbbr,
  getManagerBySleeperOwnerId,
  getManagerIdBySleeperOwnerId,
  getTeamNameBySleeperOwnerId,
  getManagerNameBySleeperOwnerId,
} from "@/utils/managerUtils";

// Record calculation utilities
export {
  calculateWinPercentage,
  calculateWinPercentageAsPercent,
  getRosterPointsFor,
  getRosterPointsAgainst,
  determineMatchupResult,
  calculateLeagueRecord,
  calculateH2HRecord,
  calculateDivisionRecord,
  calculateWeeklyLeagueRecord,
  sortTeamsByRecord,
} from "@/utils/recordUtils";

// Player data utilities
export {
  getPlayerName,
  getPlayerPosition,
  resolvePlayerData,
  getPlayerPositionFromMatchups,
  getPlayerPositionFromData,
  getPlayerPositionComprehensive,
} from "@/utils/playerDataUtils";

// H2H utilities
export {
  getAllTimeH2HRecord,
  getH2HRecordForSeason,
  getH2HRecordWithGames,
  calculateH2HStreak,
  type H2HRecord,
  type H2HGame,
  type H2HRecordWithGames,
} from "@/utils/h2h";

// Existing utilities (re-export for convenience)
export { getPlayerImageUrl } from "@/utils/playerImage";
export { getTeamName } from "@/utils/teamName";
export { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
