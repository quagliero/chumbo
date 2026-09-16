import { getPlayerPosition } from "@/utils/playerDataUtils";
import type { AllStarSlot, PlayerHistory } from "./types";

/** The lineup the All-Star team is picked into, in display order. */
const ALL_STAR_SLOTS: readonly string[] = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "K",
  "DEF",
];

const FLEX_POSITIONS = ["RB", "WR", "TE"];

const fitsSlot = (position: string, slot: string): boolean =>
  slot === "FLEX" ? FLEX_POSITIONS.includes(position) : position === slot;

/**
 * The manager's best-ever lineup: for each slot in turn, the eligible player
 * with the most career points for this manager, who has not already been used.
 *
 * Slots are filled in order, so an RB who would also win FLEX is taken by RB
 * first — which is what makes this greedy rather than optimal.
 */
export const buildAllStarLineup = ({
  playerPerformances,
}: PlayerHistory): AllStarSlot[] => {
  const lineup: AllStarSlot[] = ALL_STAR_SLOTS.map((position) => ({ position }));
  const usedPlayers = new Set<string>();
  const candidates = Array.from(playerPerformances.values());

  lineup.forEach((slot) => {
    const availablePlayers = candidates.filter(
      (p) =>
        !usedPlayers.has(p.playerId) &&
        fitsSlot(getPlayerPosition(p.playerId), slot.position)
    );

    if (availablePlayers.length === 0) return;

    const bestPlayer = availablePlayers.reduce((best, current) =>
      current.totalPoints > best.totalPoints ? current : best
    );

    slot.player = {
      playerId: bestPlayer.playerId,
      playerName: bestPlayer.playerName,
      totalPoints: bestPlayer.totalPoints,
      averagePoints:
        bestPlayer.games > 0 ? bestPlayer.totalPoints / bestPlayer.games : 0,
      games: bestPlayer.games,
    };

    usedPlayers.add(bestPlayer.playerId);
  });

  return lineup;
};
