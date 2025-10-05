import { ExtendedMatchup } from "../../types/matchup";
import { Player } from "../../types/player";
import { getPlayer } from "../data";

export interface PlayerRow {
  playerId: string | number;
  player: Player | undefined;
  points: number;
  isStarter: boolean;
  name: string;
  position: string;
}

export interface PlayerRows {
  starters: PlayerRow[];
  bench: PlayerRow[];
}

export interface OptimalLineupResult {
  optimalTotal: number;
  pointsLeftOnBench: number;
}

/**
 * Standard lineup requirements for fantasy football
 */
export const STANDARD_LINEUP_REQUIREMENTS = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DEF: 1,
} as const;

/**
 * Create a player row with all necessary data
 */
const createPlayerRow = (
  playerId: string | number,
  matchupData: ExtendedMatchup,
  isStarter: boolean,
  year: number,
  positionLabel?: string
): PlayerRow => {
  const playerIdStr = playerId.toString();
  const player = getPlayer(playerIdStr, year);
  const points = matchupData.players_points?.[playerIdStr] || 0;

  // Determine the name
  let name: string;
  if (player?.first_name || player?.last_name) {
    // We have player data with at least a first or last name
    name = `${player.first_name || ""} ${player.last_name || ""}`.trim();
  } else {
    // No player data - use ID as fallback
    name = playerIdStr;
  }

  return {
    playerId,
    player,
    points,
    isStarter,
    name,
    position: positionLabel || player?.position || "UNK",
  };
};

/**
 * Get player rows for starters and bench players
 * @param matchupData - The matchup data containing player information
 * @param year - The year for player data lookup
 * @returns Object containing starter and bench player rows
 */
export const getPlayerRows = (
  matchupData: ExtendedMatchup,
  year: number
): PlayerRows => {
  const starters = matchupData.starters || [];
  const starterIds = starters.map((s) => s.toString());
  const bench = (matchupData.players || []).filter(
    (p) => !starterIds.includes(p.toString())
  );

  // Determine position labels for starters (including FLEX)
  const starterRows = starters.map((p, idx) => {
    const playerIdStr = p.toString();
    const player = getPlayer(playerIdStr, year);

    // Typical lineup: QB, RB, RB, WR, WR, TE, FLEX, K, DEF
    // FLEX is typically at index 6 (7th position)
    let positionLabel = player?.position || "UNK";
    if (idx === 6) {
      positionLabel = "FLEX";
    }

    return createPlayerRow(p, matchupData, true, year, positionLabel);
  });

  return {
    starters: starterRows,
    bench: bench.map((p) => createPlayerRow(p, matchupData, false, year)),
  };
};

/**
 * Calculate optimal lineup score and points left on bench
 * @param matchupData - The matchup data containing player information
 * @param year - The year for player data lookup
 * @returns Object containing optimal total and points left on bench
 */
export const getOptimalLineup = (
  matchupData: ExtendedMatchup,
  year: number
): OptimalLineupResult => {
  const allPlayers = (matchupData.players || []).map((playerId) => {
    const playerIdStr = playerId.toString();
    const player = getPlayer(playerIdStr, year);
    const points = matchupData.players_points?.[playerIdStr] || 0;

    return {
      playerId,
      player,
      points,
      position: player?.position || "UNK",
    };
  });

  // Sort by points descending
  allPlayers.sort((a, b) => b.points - a.points);

  const optimalStarters: typeof allPlayers = [];
  const used = new Set<string | number>();

  // Fill mandatory positions first
  Object.entries(STANDARD_LINEUP_REQUIREMENTS).forEach(([pos, count]) => {
    const playersInPosition = allPlayers.filter(
      (p) => p.position === pos && !used.has(p.playerId)
    );
    for (let i = 0; i < count && i < playersInPosition.length; i++) {
      optimalStarters.push(playersInPosition[i]);
      used.add(playersInPosition[i].playerId);
    }
  });

  // Fill FLEX with best remaining RB/WR/TE
  const flexEligible = allPlayers.filter(
    (p) =>
      (p.position === "RB" || p.position === "WR" || p.position === "TE") &&
      !used.has(p.playerId)
  );
  if (flexEligible.length > 0) {
    optimalStarters.push(flexEligible[0]);
    used.add(flexEligible[0].playerId);
  }

  const optimalTotal = optimalStarters.reduce((sum, p) => sum + p.points, 0);
  const pointsLeftOnBench = optimalTotal - matchupData.points;

  return {
    optimalTotal,
    pointsLeftOnBench,
  };
};
