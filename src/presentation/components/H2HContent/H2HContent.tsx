import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { seasons, managers, getPlayer, players } from "../../../data";
import { getPlayerImageUrl } from "../../../utils/playerImage";
import { ExtendedRoster } from "../../../types/roster";
import { ExtendedMatchup } from "../../../types/matchup";
import { BracketMatch } from "../../../types/bracket";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../Table/Table";

type ValidYear = keyof typeof seasons;

interface H2HMatchup {
  year: number;
  week: number;
  matchupId: string | null;
  managerAPoints: number;
  managerBPoints: number;
  result: "W" | "L" | "T";
  isPlayoff: boolean;
}

interface H2HContentProps {
  managerA: string;
  managerB: string;
}

export default function H2HContent({ managerA, managerB }: H2HContentProps) {
  const [showAllRegularSeason, setShowAllRegularSeason] = useState(false);
  const { number } = useFormatter();

  const h2hData = useMemo(() => {
    const managerAData = managers.find((m) => m.id === managerA);
    const managerBData = managers.find((m) => m.id === managerB);

    if (!managerAData || !managerBData) return null;

    const regularSeasonMatchups: H2HMatchup[] = [];
    const playoffMatchups: H2HMatchup[] = [];

    // New approach: collect player scores by player name for each manager
    const managerAPlayerScores: Map<
      string,
      Array<{
        score: number;
        year: number;
        week: number;
        result: string;
        playerId: string;
      }>
    > = new Map();
    const managerBPlayerScores: Map<
      string,
      Array<{
        score: number;
        year: number;
        week: number;
        result: string;
        playerId: string;
      }>
    > = new Map();

    // Process all seasons
    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr) as ValidYear;

      // Find rosters for both managers (using sleeper IDs)
      const managerARoster = seasonData.rosters.find(
        (r: ExtendedRoster) => r.owner_id === managerAData.sleeper.id
      );
      const managerBRoster = seasonData.rosters.find(
        (r: ExtendedRoster) => r.owner_id === managerBData.sleeper.id
      );

      if (!managerARoster || !managerBRoster) return;

      // Get playoff week start for this season
      const playoffWeekStart =
        seasonData.league?.settings?.playoff_week_start || 15;

      // Process regular season matchups

      if (seasonData.matchups) {
        Object.entries(seasonData.matchups).forEach(
          ([weekStr, weekMatchups]) => {
            const week = parseInt(weekStr);

            // Skip playoff weeks for regular season matchups
            if (week >= playoffWeekStart) return;

            // Find matchups between the two managers (avoid duplicates)
            const processedMatchupIds = new Set<string>();

            weekMatchups.forEach((matchup: ExtendedMatchup) => {
              if (matchup.matchup_id === null) return;
              if (processedMatchupIds.has(matchup.matchup_id.toString()))
                return;

              const managerAMatchup =
                matchup.roster_id === managerARoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerARoster.roster_id
                    );
              const managerBMatchup =
                matchup.roster_id === managerBRoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerBRoster.roster_id
                    );

              if (!managerAMatchup || !managerBMatchup) return;

              // Mark this matchup as processed
              processedMatchupIds.add(matchup.matchup_id.toString());

              const h2hMatchup: H2HMatchup = {
                year,
                week,
                matchupId: matchup.matchup_id?.toString() || null,
                managerAPoints: managerAMatchup.points,
                managerBPoints: managerBMatchup.points,
                result:
                  managerAMatchup.points > managerBMatchup.points
                    ? "W"
                    : managerAMatchup.points < managerBMatchup.points
                    ? "L"
                    : "T",
                isPlayoff: false,
              };

              regularSeasonMatchups.push(h2hMatchup);

              // Track player scores for both managers (only in this specific matchup)
              [managerAMatchup, managerBMatchup].forEach(
                (matchup, managerIndex) => {
                  const currentPlayerScores =
                    managerIndex === 0
                      ? managerAPlayerScores
                      : managerBPlayerScores;

                  if (matchup.starters_points && matchup.starters) {
                    // Map starter positions to player IDs
                    matchup.starters.forEach((playerId, index) => {
                      // Skip empty starter slots (playerId is 0)
                      if (playerId === "0") {
                        return;
                      }

                      const points = matchup.starters_points?.[index];
                      const pointsNum = typeof points === "number" ? points : 0;
                      if (pointsNum > 0) {
                        // Check if this is a string-named player (like "Danario Alexander")
                        const isStringNamedPlayer =
                          typeof playerId === "string" &&
                          playerId.includes(" ");

                        const player = isStringNamedPlayer
                          ? null
                          : getPlayer(playerId.toString(), year);
                        const playerName = player
                          ? `${player.first_name} ${player.last_name}`
                          : playerId.toString(); // Use the ID as the name for string-named players

                        // Add this score to the player's array with context
                        if (!currentPlayerScores.has(playerName)) {
                          currentPlayerScores.set(playerName, []);
                        }
                        const result =
                          managerAMatchup.points > managerBMatchup.points
                            ? managerIndex === 0
                              ? "W"
                              : "L"
                            : managerAMatchup.points < managerBMatchup.points
                            ? managerIndex === 0
                              ? "L"
                              : "W"
                            : "T";

                        currentPlayerScores.get(playerName)!.push({
                          score: pointsNum,
                          year,
                          week,
                          result,
                          playerId: playerId.toString(),
                        });
                      }
                    });
                  }
                }
              );
            });
          }
        );
      }

      // Process playoff matchups (from matchup data, not bracket)

      if (seasonData.matchups) {
        Object.entries(seasonData.matchups).forEach(
          ([weekStr, weekMatchups]) => {
            const week = parseInt(weekStr);

            // Only include playoff weeks
            if (week < playoffWeekStart) return;

            // Find playoff matchups between the two managers (avoid duplicates)
            const processedPlayoffMatchupIds = new Set<string>();

            weekMatchups.forEach((matchup: ExtendedMatchup) => {
              if (matchup.matchup_id === null) return;
              if (processedPlayoffMatchupIds.has(matchup.matchup_id.toString()))
                return;

              const managerAMatchup =
                matchup.roster_id === managerARoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerARoster.roster_id
                    );
              const managerBMatchup =
                matchup.roster_id === managerBRoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerBRoster.roster_id
                    );

              if (!managerAMatchup || !managerBMatchup) return;

              // Check if this is a meaningful playoff game (elimination/championship only)
              // Must find a bracket match where these two specific teams are paired together
              // Exclude consolation games (3rd place, 5th place, etc.) which have 'p' property
              const meaningfulBracketMatch = seasonData.winners_bracket?.find(
                (bm: BracketMatch) => {
                  const teamAMatch =
                    bm.t1 === managerARoster.roster_id ||
                    bm.t2 === managerARoster.roster_id;
                  const teamBMatch =
                    bm.t1 === managerBRoster.roster_id ||
                    bm.t2 === managerBRoster.roster_id;
                  return teamAMatch && teamBMatch;
                }
              );

              // Only include if it's an elimination/championship game
              // Include championship (p.1) but exclude consolation games (p.3, p.5, etc.)
              const isMeaningfulPlayoff =
                meaningfulBracketMatch &&
                (!meaningfulBracketMatch.p || meaningfulBracketMatch.p === 1);

              // Debug logging for jay vs rich
              if (
                (managerAData?.id === "jay" && managerBData?.id === "rich") ||
                (managerAData?.id === "rich" && managerBData?.id === "jay")
              ) {
                console.log(`Debug jay vs rich ${year} W${week}:`, {
                  matchupId: matchup.matchup_id,
                  week,
                  meaningfulBracketMatch,
                  isMeaningfulPlayoff,
                  managerARosterId: managerARoster.roster_id,
                  managerBRosterId: managerBRoster.roster_id,
                  willInclude: isMeaningfulPlayoff,
                });
              }

              if (isMeaningfulPlayoff) {
                // Mark this matchup as processed
                processedPlayoffMatchupIds.add(matchup.matchup_id.toString());

                playoffMatchups.push({
                  year,
                  week,
                  matchupId: matchup.matchup_id?.toString() || null,
                  managerAPoints: managerAMatchup.points,
                  managerBPoints: managerBMatchup.points,
                  result:
                    managerAMatchup.points > managerBMatchup.points
                      ? "W"
                      : managerAMatchup.points < managerBMatchup.points
                      ? "L"
                      : "T",
                  isPlayoff: true,
                });

                // Track player scores for playoff matchups too
                [managerAMatchup, managerBMatchup].forEach((matchup, index) => {
                  const currentPlayerScores =
                    index === 0 ? managerAPlayerScores : managerBPlayerScores;

                  if (matchup.starters_points && matchup.starters) {
                    // Map starter positions to player IDs
                    matchup.starters.forEach((playerId, index) => {
                      // Skip empty starter slots (playerId is 0)
                      if (playerId === "0") {
                        return;
                      }

                      const points = matchup.starters_points?.[index];
                      const pointsNum = typeof points === "number" ? points : 0;
                      if (pointsNum > 0) {
                        // Check if this is a string-named player (like "Danario Alexander")
                        const isStringNamedPlayer =
                          typeof playerId === "string" &&
                          playerId.includes(" ");

                        const player = isStringNamedPlayer
                          ? null
                          : getPlayer(playerId.toString(), year);
                        const playerName = player
                          ? `${player.first_name} ${player.last_name}`
                          : playerId.toString(); // Use the ID as the name for string-named players

                        // Add this score to the player's array with context
                        if (!currentPlayerScores.has(playerName)) {
                          currentPlayerScores.set(playerName, []);
                        }
                        currentPlayerScores.get(playerName)!.push({
                          score: pointsNum,
                          year,
                          week,
                          result:
                            managerAMatchup.points > managerBMatchup.points
                              ? index === 0
                                ? "W"
                                : "L"
                              : managerAMatchup.points < managerBMatchup.points
                              ? index === 0
                                ? "L"
                                : "W"
                              : "T",
                          playerId: playerId.toString(),
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        );
      }
    });

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

    let currentStreak = { type: "W" as "W" | "L" | "T", count: 0 };
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

      currentStreak = { type: mostRecentResult, count: streakCount };
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
      const getPlayerPosition = (playerName: string) => {
        // First, try to find player in any year's players.json
        let player = null;
        for (const [, seasonData] of Object.entries(seasons)) {
          if (seasonData.players) {
            player = Object.values(seasonData.players).find(
              (p) => `${p.first_name} ${p.last_name}` === playerName
            );
            if (player) break;
          }
        }

        // Also try root players.json
        if (!player && players) {
          // players is a Record<string, Player>
          player = Object.values(players).find(
            (p) => `${p.first_name} ${p.last_name}` === playerName
          );
        }

        // If found in players.json, return the position
        if (player) {
          return player.position;
        }

        // If not found in players.json, check if it's a string-named player in unmatched_players
        for (const [, seasonData] of Object.entries(seasons)) {
          for (const [, weekMatchups] of Object.entries(
            seasonData.matchups || {}
          )) {
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

        return "UNK"; // Default if position not found
      };

      // Fill each position with the best available player
      lineup.forEach((slot) => {
        const availablePlayers = performances.filter(
          (p) => !usedPlayers.has(p.playerName)
        );

        if (slot.position === "FLEX") {
          // FLEX can be RB, WR, or TE
          const flexPlayers = availablePlayers.filter((p) => {
            const pos = getPlayerPosition(p.playerName);
            return pos === "RB" || pos === "WR" || pos === "TE";
          });
          if (flexPlayers.length > 0) {
            slot.player = flexPlayers[0];
            usedPlayers.add(slot.player.playerName);
          }
        } else {
          // Specific position
          const positionPlayers = availablePlayers.filter((p) => {
            const pos = getPlayerPosition(p.playerName);
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
      managerA: managerAData,
      managerB: managerBData,
      regularSeasonMatchups: sortedMatchups,
      playoffMatchups,
      managerALineup,
      managerBLineup,
      managerABestPerformances,
      managerBBestPerformances,
      stats: {
        managerAWins,
        managerBWins,
        ties,
        managerATotalPoints,
        managerBTotalPoints,
        managerAAvgPoints,
        managerBAvgPoints,
        currentStreak,
      },
    };
  }, [managerA, managerB]);

  if (!h2hData) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Matchup Not Found
        </h1>
        <p className="text-gray-600">
          The requested head-to-head matchup could not be found.
        </p>
      </div>
    );
  }

  const {
    managerA: managerAData,
    managerB: managerBData,
    regularSeasonMatchups,
    playoffMatchups,
    managerALineup,
    managerBLineup,
    managerABestPerformances,
    managerBBestPerformances,
    stats,
  } = h2hData;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {managerAData?.teamName} vs {managerBData?.teamName}
          </h1>
          <p className="text-gray-600">
            Head-to-Head Record: {managerAData?.teamName} {stats.managerAWins}-
            {stats.managerBWins} {managerBData?.teamName}
            {stats.ties > 0 && ` (${stats.ties} ties)`}
          </p>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Overall Statistics
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-neutral-200 md:divide-x divide-y md:divide-y-0">
            {/* Manager A Stats */}
            <div className="text-center md:pb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {managerAData?.teamName}
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerAWins}
                  </div>
                  <div className="text-sm text-gray-600">Wins</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerBWins}
                  </div>
                  <div className="text-sm text-gray-600">Losses</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.ties}
                  </div>
                  <div className="text-sm text-gray-600">Ties</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {number(stats.managerAAvgPoints, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm text-gray-600">Avg Points</div>
                </div>
              </div>
            </div>

            {/* Manager B Stats */}
            <div className="text-center pt-4 md:pt-0 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {managerBData?.teamName}
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerBWins}
                  </div>
                  <div className="text-sm text-gray-600">Wins</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerAWins}
                  </div>
                  <div className="text-sm text-gray-600">Losses</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.ties}
                  </div>
                  <div className="text-sm text-gray-600">Ties</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {number(stats.managerBAvgPoints, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm text-gray-600">Avg Points</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-2">
              <span className="text-lg font-medium text-gray-900">
                Current Streak:
              </span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  stats.currentStreak.type === "W"
                    ? "bg-blue-100 text-blue-800"
                    : stats.currentStreak.type === "L"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {stats.currentStreak.type === "W"
                  ? managerAData?.teamName
                  : stats.currentStreak.type === "L"
                  ? managerAData?.teamName
                  : "Tie"}{" "}
                {stats.currentStreak.type}
                {stats.currentStreak.count}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Regular Season Matchups */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Regular Season Matchups
            </h2>
            {regularSeasonMatchups.length > 5 && (
              <button
                onClick={() => setShowAllRegularSeason(!showAllRegularSeason)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showAllRegularSeason ? "Show Last 5" : "Show All"}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className="text-left">Year</TableHeaderCell>
                <TableHeaderCell className="text-left">Week</TableHeaderCell>
                <TableHeaderCell className="text-left">Score</TableHeaderCell>
                <TableHeaderCell className="text-left">Result</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(showAllRegularSeason
                ? regularSeasonMatchups
                : regularSeasonMatchups.slice(0, 5)
              ).map((matchup, index) => (
                <TableRow key={`${matchup.year}-${matchup.week}-${index}`}>
                  <TableCell className="font-medium">{matchup.year}</TableCell>
                  <TableCell>
                    {matchup.matchupId ? (
                      <Link
                        to={`/history/${matchup.year}/matchups/${matchup.week}/${matchup.matchupId}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Week {matchup.week}
                      </Link>
                    ) : (
                      `Week ${matchup.week}`
                    )}
                  </TableCell>
                  <TableCell>
                    {number(matchup.managerAPoints, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    -{" "}
                    {number(matchup.managerBPoints, {
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        matchup.result === "W"
                          ? "bg-blue-100 text-blue-800"
                          : matchup.result === "L"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {matchup.result === "W"
                        ? managerAData?.teamName
                        : matchup.result === "L"
                        ? managerBData?.teamName
                        : "Tie"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Playoff Matchups */}
      {playoffMatchups.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Playoff Matchups
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              These games are not included in the overall statistics above.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell className="text-left">Year</TableHeaderCell>
                  <TableHeaderCell className="text-left">Round</TableHeaderCell>
                  <TableHeaderCell className="text-left">Score</TableHeaderCell>
                  <TableHeaderCell className="text-left">
                    Result
                  </TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playoffMatchups
                  .sort((a, b) => {
                    // Sort by year (newest first), then by week (round 1 = championship first)
                    if (a.year !== b.year) {
                      return b.year - a.year;
                    }
                    return a.week - b.week;
                  })
                  .map((matchup, index) => (
                    <TableRow
                      key={`playoff-${matchup.year}-${matchup.week}-${index}`}
                    >
                      <TableCell className="font-medium">
                        {matchup.year}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const playoffStartWeek =
                            seasons[matchup.year as ValidYear]?.league?.settings
                              ?.playoff_week_start || 15;
                          const playoffTeams =
                            seasons[matchup.year as ValidYear]?.league?.settings
                              ?.playoff_teams || 6;

                          if (playoffTeams === 4) {
                            // 4-team playoff: no wildcard round
                            const championshipWeek = playoffStartWeek + 1;
                            const semiFinalsWeek = playoffStartWeek;

                            if (matchup.week === championshipWeek) {
                              return "Championship";
                            } else if (matchup.week === semiFinalsWeek) {
                              return "Semi Finals";
                            } else {
                              return `Round ${matchup.week}`;
                            }
                          } else {
                            // 6+ team playoff: has wildcard round
                            const championshipWeek = playoffStartWeek + 2;
                            const semiFinalsWeek = playoffStartWeek + 1;
                            const wildcardWeek = playoffStartWeek;

                            if (matchup.week === championshipWeek) {
                              return "Championship";
                            } else if (matchup.week === semiFinalsWeek) {
                              return "Semi Finals";
                            } else if (matchup.week === wildcardWeek) {
                              return "Wildcard";
                            } else {
                              return `Round ${matchup.week}`;
                            }
                          }
                        })()}
                      </TableCell>
                      <TableCell>
                        {number(matchup.managerAPoints, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        -{" "}
                        {number(matchup.managerBPoints, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            matchup.result === "W"
                              ? "bg-blue-100 text-blue-800"
                              : matchup.result === "L"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {matchup.result === "W"
                            ? managerAData?.teamName
                            : matchup.result === "L"
                            ? managerBData?.teamName
                            : "Tie"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* All-Star Lineups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[
          {
            teamName: managerAData?.teamName,
            lineup: managerALineup,
            opponentName: managerBData?.teamName,
          },
          {
            teamName: managerBData?.teamName,
            lineup: managerBLineup,
            opponentName: managerAData?.teamName,
          },
        ].map(({ teamName, lineup, opponentName }) => (
          <div
            key={teamName}
            className="bg-white rounded-lg shadow overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {teamName} All-Stars
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Top performers against {opponentName}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell className="text-left pr-0">
                      Pos
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Player
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Games
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Points
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Average
                    </TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineup.map((slot, index) => (
                    <TableRow key={index}>
                      <TableCell className="pr-0">{slot.position}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {slot.player && (
                            <img
                              src={getPlayerImageUrl(slot.player.playerId)}
                              alt={slot.player.playerName}
                              className="w-6 h-6 rounded-full flex-none object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                          {slot.player ? slot.player.playerName : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {slot.player ? slot.player.gamesPlayed : "—"}
                      </TableCell>
                      <TableCell>
                        {slot.player
                          ? number(slot.player.totalPoints, {
                              maximumFractionDigits: 2,
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {slot.player
                          ? number(slot.player.averagePoints, {
                              maximumFractionDigits: 2,
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>

      {/* Best Performances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {[
          {
            teamName: managerAData?.teamName,
            performances: managerABestPerformances,
            opponentName: managerBData?.teamName,
          },
          {
            teamName: managerBData?.teamName,
            performances: managerBBestPerformances,
            opponentName: managerAData?.teamName,
          },
        ].map(({ teamName, performances, opponentName }) => (
          <div
            key={teamName}
            className="bg-white rounded-lg shadow overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {teamName} Best Performances
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Top 5 individual game scores against {opponentName}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell className="text-left">
                      Player
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Year/Week
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Points
                    </TableHeaderCell>
                    <TableHeaderCell className="text-left">
                      Result
                    </TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performances.map((performance, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <img
                            src={getPlayerImageUrl(performance.playerId)}
                            alt={performance.playerName}
                            className="w-6 h-6 rounded-full flex-none object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          {performance.playerName}
                        </div>
                      </TableCell>
                      <TableCell>
                        {performance.year} W{performance.week}
                      </TableCell>
                      <TableCell>
                        {number(performance.score, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            performance.result === "W"
                              ? "bg-green-100 text-green-800"
                              : performance.result === "L"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {performance.result}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
