import managers from "../data/managers.json";
import { ExtendedUser } from "../types/user";

/**
 * Get team name by owner ID with fallback hierarchy
 * @param ownerId - Sleeper owner ID
 * @param users - Optional users array from season data for team name lookup
 * @returns Team name with fallback to manager name, display name, or "Unknown"
 */
export const getTeamName = (
  ownerId: string,
  users?: ExtendedUser[]
): string => {
  // First try to get team name from users metadata
  if (users) {
    const user = users.find((u) => u.user_id === ownerId);
    if (user?.metadata?.team_name && user.metadata.team_name.trim() !== "") {
      return user.metadata.team_name;
    }
  }

  // Fallback to manager data
  const manager = managers.find((m) => m.sleeper?.id === ownerId);
  if (manager?.teamName) {
    return manager.teamName;
  }

  // Final fallback to user display name if available
  if (users) {
    const user = users.find((u) => u.user_id === ownerId);
    if (user?.display_name) {
      return user.display_name;
    }
  }

  return "Unknown";
};
