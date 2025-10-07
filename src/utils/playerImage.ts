/**
 * Get the appropriate image URL for a player or defense
 * @param playerId - Player ID or team abbreviation
 * @param position - Player position (used to detect defenses)
 * @returns Image URL (player headshot or team logo)
 */
export const getPlayerImageUrl = (
  playerId: string | number,
  position?: string
): string => {
  const playerIdStr = playerId.toString();

  // Check if it's a defense (position is DEF or ID matches defense pattern)
  if (
    position === "DEF" ||
    (isNaN(Number(playerIdStr)) &&
      playerIdStr.length <= 3 &&
      playerIdStr === playerIdStr.toUpperCase())
  ) {
    return `https://sleepercdn.com/images/team_logos/nfl/${playerIdStr.toLowerCase()}.png`;
  }

  // Regular player headshot
  return `https://sleepercdn.com/content/nfl/players/${playerIdStr}.jpg`;
};
