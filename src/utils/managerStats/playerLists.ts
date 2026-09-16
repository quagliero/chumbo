import { resolvePlayerName } from "./playerNames";
import type {
  MostCappedPlayer,
  MostDraftedPlayer,
  PlayerHistory,
  TopPerformance,
} from "./types";

/** Descending by count, then by most recent year. */
const byCountThenRecency = (
  aCount: number,
  bCount: number,
  aYears: number[],
  bYears: number[]
): number => {
  if (bCount !== aCount) return bCount - aCount;
  return Math.max(...bYears) - Math.max(...aYears);
};

/**
 * Players this manager has drafted most often, best pick first for each.
 *
 * "Times drafted" counts *seasons*, not picks — a player taken twice in the
 * same draft (which the old Yahoo-era data does contain) counts once.
 */
export const buildMostDraftedPlayers = ({
  draftHistory,
  playerPerformances,
}: PlayerHistory): MostDraftedPlayer[] =>
  Array.from(draftHistory.entries())
    .map(([playerId, picks]) => {
      // Prefer the name already resolved from a lineup; fall back to the
      // dictionary for players who were drafted but never started.
      const playerName =
        playerPerformances.get(playerId)?.playerName ||
        resolvePlayerName(playerId, undefined, `Player ${playerId}`);

      const bestPick = picks.reduce((best, current) =>
        current.round < best.round ||
        (current.round === best.round && current.pick < best.pick)
          ? current
          : best
      );

      const yearsDrafted = [...new Set(picks.map((p) => p.year))].sort();

      return {
        playerId,
        playerName,
        timesDrafted: yearsDrafted.length,
        years: yearsDrafted,
        bestPick,
      };
    })
    .sort((a, b) =>
      byCountThenRecency(a.timesDrafted, b.timesDrafted, a.years, b.years)
    );

/** Players this manager has started most often. */
export const buildMostCappedPlayers = ({
  playerPerformances,
}: PlayerHistory): MostCappedPlayer[] =>
  Array.from(playerPerformances.values())
    .map((player) => {
      // `allScores` only holds started games, so its length is the cap count.
      const starts = player.allScores.length;

      return {
        playerId: player.playerId,
        playerName: player.playerName,
        starts,
        years: [...new Set(player.allScores.map((score) => score.year))].sort(),
        averageScore: starts > 0 ? player.totalPoints / starts : 0,
      };
    })
    .filter((player) => player.starts > 0)
    .sort((a, b) => byCountThenRecency(a.starts, b.starts, a.years, b.years));

/** Every individual scoring week by one of this manager's starters, best first. */
export const buildTopPerformances = ({
  playerPerformances,
}: PlayerHistory): TopPerformance[] =>
  Array.from(playerPerformances.values())
    .flatMap((player) =>
      player.allScores.map((score) => ({
        playerId: player.playerId,
        playerName: player.playerName,
        year: score.year,
        week: score.week,
        points: score.score,
        result: score.result as "W" | "L" | "T",
        opponentName: score.opponentName,
        matchup_id: score.matchup_id,
      }))
    )
    .sort((a, b) => b.points - a.points);
