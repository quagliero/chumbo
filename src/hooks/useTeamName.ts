import { useCallback } from "react";
import { ExtendedUser } from "@/types/user";
import { getTeamName } from "@/utils/teamName";

/**
 * Custom hook for getting team names with user context
 * @param users - Optional users array from season data
 * @returns Function to get team name by owner ID
 */
export const useTeamName = (users?: ExtendedUser[]) => {
  return useCallback((ownerId: string) => getTeamName(ownerId, users), [users]);
};
