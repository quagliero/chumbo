import { ExtendedMatchup } from "@/types/matchup";
import { getPlayer, getPlayers } from "@/data";
import { seasons } from "@/data";
import { legacyPlayers } from "@/data/legacyPlayers";

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

  // Ground truth first (A1c). `unmatched_players` records the position the player
  // was actually slotted at in that game; the dictionary only knows his position
  // *now*, and Sleeper reclassifies people. Devin Funchess is a TE in the 2026
  // dump but lined up at WR every year he was on a Chumbo roster, and Marcel Reece
  // is listed FB — a slot this league does not field — though he played RB.
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

  // Then the dictionary — base, corrected by this season's overlay where one
  // exists. The overlay's `p` is a rare correction; team is what actually varies.
  if (player?.position && player.position !== "UNK") {
    return player.position;
  }

  // A legacy string-named player's position is a committed fact, derived from
  // exactly the sweep below by `yarn build-aggregates`. Reading it here is not
  // an optimisation: the sweep reads every season's matchups, which since A2b
  // is a guarded read, so a draft board with one "Beanie Wells" on it would
  // otherwise download the whole archive to learn he was a RB.
  const legacyPosition = legacyPlayers[playerIdStr];
  if (legacyPosition) {
    return legacyPosition;
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
  const foundPlayer = Object.values(getPlayers()).find(
    (p) =>
      p.full_name === playerIdStr ||
      `${p.first_name} ${p.last_name}` === playerIdStr
  );
  if (foundPlayer?.position) {
    return foundPlayer.position;
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
  // The base dictionary is the union of every snapshot, so one scan covers what
  // used to be a scan per season.
  const player = Object.values(getPlayers()).find(
    (p) =>
      p.full_name === playerName ||
      `${p.first_name} ${p.last_name}` === playerName
  );

  return player?.position ?? "UNK";
};

/**
 * Comprehensive player position lookup that tries multiple sources
 *
 * Matchup data comes first: it records the position the player was actually
 * slotted at in that game, whereas the dictionary only knows his position *now*.
 * Sleeper reclassifies players — Devin Funchess is a TE in the 2026 dump and was a
 * WR every year he was on a Chumbo roster — so the dictionary is the fallback, not
 * the source of truth (A1c).
 *
 * @param playerName - Player name to search for
 * @returns Player position or "UNK" as fallback
 */
export const getPlayerPositionComprehensive = (playerName: string): string => {
  const positionFromMatchups = getPlayerPositionFromMatchups(playerName);
  if (positionFromMatchups !== "UNK") {
    return positionFromMatchups;
  }

  return getPlayerPositionFromData(playerName);
};
