import { ExtendedMatchup } from "@/types/matchup";
import { getPlayer } from "@/data";
import { seasons } from "@/data";
import { players } from "@/data";

/**
 * Get player name with fallbacks for string-named players
 * @param playerId - Player ID (can be string name)
 * @param year - Optional year for player data lookup
 * @param matchupData - Optional matchup data for unmatched_players lookup
 * @returns Player name or playerId as fallback
 */
export const getPlayerName = (
  playerId: string | number,
  year?: number
): string => {
  const playerIdStr = playerId.toString();

  // Handle empty starter slot
  if (playerId === 0 || playerId === "0") {
    return "—"; // Em dash for empty slot
  }

  const player = getPlayer(playerIdStr, year);

  // Determine the name
  if (player?.first_name || player?.last_name) {
    // We have player data with at least a first or last name
    return `${player.first_name || ""} ${player.last_name || ""}`.trim();
  }

  // No player data - use ID as fallback
  return playerIdStr;
};

/**
 * Get position from unmatched_players record (shared utility)
 * @param playerId - Player ID to look up
 * @param player - Optional player object to try matching by name
 * @param unmatchedPlayers - Record of unmatched players (player name -> position)
 * @returns Position if found, undefined otherwise
 */
const getPositionFromUnmatchedPlayers = (
  playerId: string,
  player: ReturnType<typeof getPlayer> | undefined,
  unmatchedPlayers: Record<string, string> | undefined
): string | undefined => {
  if (!unmatchedPlayers) return undefined;

  // Try direct lookup by playerId (for cases where playerId is the name)
  if (unmatchedPlayers[playerId]) {
    return unmatchedPlayers[playerId];
  }

  // If we have a player object, try to match by player's full name
  if (player) {
    const fullName =
      player.full_name ||
      `${player.first_name || ""} ${player.last_name || ""}`.trim();
    if (fullName && unmatchedPlayers[fullName]) {
      return unmatchedPlayers[fullName];
    }
  }

  return undefined;
};

/**
 * Get player position with fallbacks for string-named players
 * @param playerId - Player ID (can be string name)
 * @param year - Optional year for player data lookup
 * @param matchupData - Optional matchup data for unmatched_players lookup
 * @param unmatchedPlayers - Optional unmatched_players record (for transactions)
 * @returns Player position or "UNK" as fallback
 */
export const getPlayerPosition = (
  playerId: string | number,
  year?: number,
  matchupData?: ExtendedMatchup,
  unmatchedPlayers?: Record<string, string>
): string => {
  const playerIdStr = playerId.toString();

  // Handle empty starter slot
  if (playerId === 0 || playerId === "0") {
    return "UNK";
  }

  const player = getPlayer(playerIdStr, year);

  // First try to get position from player data
  if (player?.position && player.position !== "UNK") {
    return player.position;
  }

  // Check unmatched_players from transaction (if provided)
  if (unmatchedPlayers) {
    const position = getPositionFromUnmatchedPlayers(
      playerIdStr,
      player,
      unmatchedPlayers
    );
    if (position) {
      return position;
    }
  }

  // Check unmatched_players in provided matchup data
  if (matchupData?.unmatched_players) {
    const position = getPositionFromUnmatchedPlayers(
      playerIdStr,
      player,
      matchupData.unmatched_players
    );
    if (position) {
      return position;
    }
  }

  // Search through all seasons to find position information for this player
  for (const [, seasonData] of Object.entries(seasons)) {
    for (const [, weekMatchups] of Object.entries(seasonData.matchups || {})) {
      for (const matchup of weekMatchups) {
        if (matchup.unmatched_players) {
          const position = getPositionFromUnmatchedPlayers(
            playerIdStr,
            player,
            matchup.unmatched_players
          );
          if (position) {
            return position;
          }
        }
      }
    }
  }

  // Also try root players.json for string-named players
  if (players) {
    const foundPlayer = Object.values(players).find(
      (p) =>
        p.full_name === playerIdStr ||
        `${p.first_name} ${p.last_name}` === playerIdStr
    );
    if (foundPlayer?.position) {
      return foundPlayer.position;
    }
  }

  return "UNK"; // Default if position not found
};

/**
 * Get both player name and position in one call
 * @param playerId - Player ID (can be string name)
 * @param year - Optional year for player data lookup
 * @param matchupData - Optional matchup data for unmatched_players lookup
 * @param unmatchedPlayers - Optional unmatched_players record (for transactions)
 * @returns Object with name and position
 */
export const resolvePlayerData = (
  playerId: string | number,
  year?: number,
  matchupData?: ExtendedMatchup,
  unmatchedPlayers?: Record<string, string>
): { name: string; position: string } => {
  return {
    name: getPlayerName(playerId, year),
    position: getPlayerPosition(playerId, year, matchupData, unmatchedPlayers),
  };
};

/**
 * Get player position for string-named players by searching through all seasons
 * This is a more comprehensive search that looks through all matchup data
 * @param playerName - Player name to search for
 * @returns Player position or "UNK" as fallback
 */
export const getPlayerPositionFromMatchups = (playerName: string): string => {
  // Look through all seasons to find position information for this player
  for (const [, seasonData] of Object.entries(seasons)) {
    for (const [, weekMatchups] of Object.entries(seasonData.matchups || {})) {
      for (const matchup of weekMatchups) {
        if (
          matchup.unmatched_players &&
          matchup.unmatched_players[playerName]
        ) {
          return matchup.unmatched_players[playerName];
        }
      }
    }
  }

  return "UNK";
};

/**
 * Get player position by searching through player data files
 * @param playerName - Player name to search for
 * @returns Player position or "UNK" as fallback
 */
export const getPlayerPositionFromData = (playerName: string): string => {
  // Try to find player using getPlayer by searching for matching names
  // This is a bit tricky since getPlayer expects an ID, but we have a name
  // So we'll search through all players to find one with matching name
  for (const [, seasonData] of Object.entries(seasons)) {
    if (seasonData.players) {
      const player = Object.values(seasonData.players).find(
        (p) =>
          p.full_name === playerName ||
          `${p.first_name} ${p.last_name}` === playerName
      );
      if (player?.position) {
        return player.position;
      }
    }
  }

  // Also try root players.json
  if (players) {
    const player = Object.values(players).find(
      (p) =>
        p.full_name === playerName ||
        `${p.first_name} ${p.last_name}` === playerName
    );
    if (player?.position) {
      return player.position;
    }
  }

  return "UNK";
};

/**
 * Comprehensive player position lookup that tries multiple sources
 * @param playerName - Player name to search for
 * @returns Player position or "UNK" as fallback
 */
export const getPlayerPositionComprehensive = (playerName: string): string => {
  // First try data files
  const positionFromData = getPlayerPositionFromData(playerName);
  if (positionFromData !== "UNK") {
    return positionFromData;
  }

  // Then try matchup data
  const positionFromMatchups = getPlayerPositionFromMatchups(playerName);
  if (positionFromMatchups !== "UNK") {
    return positionFromMatchups;
  }

  return "UNK";
};
