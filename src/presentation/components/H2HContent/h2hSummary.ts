import { getPlayerPositionComprehensive } from "@/utils/playerDataUtils";
import { H2HMatchup, PlayerGameScore } from "./h2hGames";

/**
 * What the page says about the games `collectH2HGames` found: the record and
 * averages (regular season only), the current streak, an All-Star lineup per
 * side and each side's five best single-game performances.
 *
 * The second half of what was the page's `useMemo`, moved as it was.
 */
export const summariseH2H = (
  regularSeasonMatchups: H2HMatchup[],
  managerAPlayerScores: Map<string, PlayerGameScore[]>,
  managerBPlayerScores: Map<string, PlayerGameScore[]>
) => {
  // Calculate overall stats for both teams
  const managerAWins = regularSeasonMatchups.filter(
    (m) => m.result === "W"
  ).length;
  const managerBWins = regularSeasonMatchups.filter(
    (m) => m.result === "L"
  ).length;
  const ties = regularSeasonMatchups.filter((m) => m.result === "T").length;

  const managerATotalPoints = regularSeasonMatchups.reduce(
    (sum, m) => sum + m.managerAPoints,
    0
  );
  const managerBTotalPoints = regularSeasonMatchups.reduce(
    (sum, m) => sum + m.managerBPoints,
    0
  );

  const managerAAvgPoints =
    regularSeasonMatchups.length > 0
      ? managerATotalPoints / regularSeasonMatchups.length
      : 0;
  const managerBAvgPoints =
    regularSeasonMatchups.length > 0
      ? managerBTotalPoints / regularSeasonMatchups.length
      : 0;

  // Calculate current streak
  const sortedMatchups = [...regularSeasonMatchups].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.week - a.week;
  });

  // The run belongs to whoever is winning it. Results are from manager A's
  // side, so A's losses are B's wins: a run of "L" is B's winning streak, not
  // A's losing one — it used to be shown as "A L3" in A's colour, which read
  // as though A were the one on a run. A run of ties belongs to neither.
  let currentStreak = {
    type: "W" as "W" | "T",
    count: 0,
    manager: null as "A" | "B" | null,
  };
  if (sortedMatchups.length > 0) {
    const mostRecentResult = sortedMatchups[0].result;
    let streakCount = 1;

    for (let i = 1; i < sortedMatchups.length; i++) {
      if (sortedMatchups[i].result === mostRecentResult) {
        streakCount++;
      } else {
        break;
      }
    }

    currentStreak = {
      type: mostRecentResult === "T" ? "T" : "W",
      count: streakCount,
      manager:
        mostRecentResult === "W" ? "A" : mostRecentResult === "L" ? "B" : null,
    };
  }

  // Process player scores into All-Stars format
  const managerAPerformances = Array.from(managerAPlayerScores.entries())
    .map(([playerName, scores]) => ({
      playerName,
      playerId: scores[0]?.playerId || playerName, // Use first score's playerId, fallback to playerName
      totalPoints: scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0),
      gamesPlayed: scores.length,
      averagePoints:
        scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0) /
        scores.length,
      bestScore: Math.max(...scores.map((s) => s.score)),
      allScores: scores,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const managerBPerformances = Array.from(managerBPlayerScores.entries())
    .map(([playerName, scores]) => ({
      playerName,
      playerId: scores[0]?.playerId || playerName, // Use first score's playerId, fallback to playerName
      totalPoints: scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0),
      gamesPlayed: scores.length,
      averagePoints:
        scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0) /
        scores.length,
      bestScore: Math.max(...scores.map((s) => s.score)),
      allScores: scores,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Create valid lineups for All-Stars
  const createValidLineup = (performances: typeof managerAPerformances) => {
    const lineup: Array<{
      position: string;
      player: (typeof performances)[0] | null;
    }> = [
      { position: "QB", player: null },
      { position: "RB", player: null },
      { position: "RB", player: null },
      { position: "WR", player: null },
      { position: "WR", player: null },
      { position: "TE", player: null },
      { position: "FLEX", player: null },
      { position: "K", player: null },
      { position: "DEF", player: null },
    ];

    // Track which players we've already used
    const usedPlayers = new Set<string>();

    // Helper function to get player position
    const getPlayerPositionLocal = (playerName: string) => {
      return getPlayerPositionComprehensive(playerName);
    };

    // Fill each position with the best available player
    lineup.forEach((slot) => {
      const availablePlayers = performances.filter(
        (p) => !usedPlayers.has(p.playerName)
      );

      if (slot.position === "FLEX") {
        // FLEX can be RB, WR, or TE
        const flexPlayers = availablePlayers.filter((p) => {
          const pos = getPlayerPositionLocal(p.playerName);
          return pos === "RB" || pos === "WR" || pos === "TE";
        });
        if (flexPlayers.length > 0) {
          slot.player = flexPlayers[0];
          usedPlayers.add(slot.player.playerName);
        }
      } else {
        // Specific position
        const positionPlayers = availablePlayers.filter((p) => {
          const pos = getPlayerPositionLocal(p.playerName);
          return pos === slot.position;
        });
        if (positionPlayers.length > 0) {
          slot.player = positionPlayers[0];
          usedPlayers.add(slot.player.playerName);
        }
      }
    });

    return lineup;
  };

  const managerALineup = createValidLineup(managerAPerformances);
  const managerBLineup = createValidLineup(managerBPerformances);

  // Get best performances (top 10 individual game scores, deduplicated by player)
  const managerABestPerformances = managerAPerformances
    .flatMap((p) =>
      p.allScores.map((scoreObj) => ({
        playerName: p.playerName,
        playerId: p.playerId,
        score: scoreObj.score,
        year: scoreObj.year,
        week: scoreObj.week,
        result: scoreObj.result,
      }))
    )
    .sort((a, b) => b.score - a.score)
    .filter((performance, index, array) => {
      // Keep only the first occurrence of each player (highest score)
      return (
        array.findIndex((p) => p.playerId === performance.playerId) === index
      );
    })
    .slice(0, 5);

  const managerBBestPerformances = managerBPerformances
    .flatMap((p) =>
      p.allScores.map((scoreObj) => ({
        playerName: p.playerName,
        playerId: p.playerId,
        score: scoreObj.score,
        year: scoreObj.year,
        week: scoreObj.week,
        result: scoreObj.result,
      }))
    )
    .sort((a, b) => b.score - a.score)
    .filter((performance, index, array) => {
      // Keep only the first occurrence of each player (highest score)
      return (
        array.findIndex((p) => p.playerId === performance.playerId) === index
      );
    })
    .slice(0, 5);

  return {
    managerAWins,
    managerBWins,
    ties,
    managerATotalPoints,
    managerBTotalPoints,
    managerAAvgPoints,
    managerBAvgPoints,
    currentStreak,
    sortedMatchups,
    managerALineup,
    managerBLineup,
    managerABestPerformances,
    managerBBestPerformances,
  };
};
