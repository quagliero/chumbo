import managers from "@/data/managers.json";
import { ExtendedUser } from "@/types/user";

/**
 * Get team name by owner ID with fallback hierarchy
 *
 * The season's own `users.json` wins over `managers.json`, deliberately: a team
 * name belongs to a season. rich's team is "Zaragozas Zooting Zoro" in 2021-24
 * and "Zaragozas Zooting Zorro" from 2025, against "Zaragoza's Zooting Zorro"
 * in managers.json — those are three names he actually used, not a data error,
 * and a 2022 page should say what the team was called in 2022.
 *
 * Names ARE trimmed, though. Eight of them carry trailing whitespace in the
 * Sleeper data ("#Narrative ", "Garbage ", rich's every season since 2021), and
 * this function used to test `.trim() !== ""` and then return the untrimmed
 * value — so the space reached every table, heading and share card that asked.
 *
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
    const teamName = user?.metadata?.team_name?.trim();
    if (teamName) {
      return teamName;
    }
  }

  // Fallback to manager data
  const manager = managers.find((m) => m.sleeper?.id === ownerId);
  if (manager?.teamName) {
    return manager.teamName.trim();
  }

  // Final fallback to user display name if available
  if (users) {
    const user = users.find((u) => u.user_id === ownerId);
    if (user?.display_name?.trim()) {
      return user.display_name.trim();
    }
  }

  return "Unknown";
};
