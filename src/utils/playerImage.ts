/**
 * Get the appropriate image URL for a player or defense
 * @param playerId - Player ID or team abbreviation
 * @param position - Player position (used to detect defenses)
 * @returns Image URL (player headshot or team logo) or undefined if player doesn't exist
 */
export const getPlayerImageUrl = (
  playerId: string | number,
  position?: string
): string | undefined => {
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

  // If position is not DEF and playerId is not a number, it's a string-named player
  // String-named players don't exist in players.json, so no image available
  if (position !== "DEF" && isNaN(Number(playerIdStr))) {
    return undefined;
  }

  // Regular player headshot for numeric IDs
  return `https://sleepercdn.com/content/nfl/players/${playerIdStr}.jpg`;
};
