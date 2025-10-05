import managers from "../data/managers.json";

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
