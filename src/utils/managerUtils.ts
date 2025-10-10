import managers from "@/data/managers.json";

/**
 * Get manager abbreviation/display name for a given owner ID
 * @param ownerId - The Sleeper owner ID
 * @returns Manager display name or "??" if not found
 */
export const getManagerAbbr = (ownerId: string): string => {
  const manager = managers.find((m) => m.sleeper?.id === ownerId);
  if (manager?.teamName) {
    // Return display name from Sleeper
    return manager.sleeper.display_name;
  }
  return "??";
};

/**
 * Find manager by Sleeper owner ID
 * @param ownerId - The Sleeper owner ID
 * @returns Manager object or undefined if not found
 */
export const getManagerBySleeperOwnerId = (ownerId: string) => {
  return managers.find((m) => m.sleeper?.id === ownerId);
};

/**
 * Get internal manager ID from Sleeper owner ID
 * @param ownerId - The Sleeper owner ID
 * @returns Internal manager ID or undefined if not found
 */
export const getManagerIdBySleeperOwnerId = (
  ownerId: string
): string | undefined => {
  const manager = managers.find((m) => m.sleeper?.id === ownerId);
  return manager?.id;
};

/**
 * Get team name from Sleeper owner ID
 * @param ownerId - The Sleeper owner ID
 * @returns Team name or undefined if not found
 */
export const getTeamNameBySleeperOwnerId = (
  ownerId: string
): string | undefined => {
  const manager = managers.find((m) => m.sleeper?.id === ownerId);
  return manager?.teamName || manager?.sleeper?.display_name;
};

/**
 * Get manager name from Sleeper owner ID
 * @param ownerId - The Sleeper owner ID
 * @returns Manager name or undefined if not found
 */
export const getManagerNameBySleeperOwnerId = (
  ownerId: string
): string | undefined => {
  const manager = managers.find((m) => m.sleeper?.id === ownerId);
  return manager?.name;
};
