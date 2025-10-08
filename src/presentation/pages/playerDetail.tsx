import { useParams, Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
} from "@tanstack/react-table";
import { getPlayer, seasons } from "../../data";
import managers from "../../data/managers.json";
import { getPlayerImageUrl } from "../../utils/playerImage";
import { getTeamName } from "../../utils/teamName";

interface PlayerPerformance {
  year: number;
  week: number;
  opponent: string;
  points: number;
  wasStarted: boolean;
  matchupId: number;
  ownerId: string;
  teamName: string;
  isByeWeek?: boolean;
}

interface OwnerStats {
  ownerId: string;
  teamName: string;
  gamesPlayed: number;
  totalPoints: number;
  averagePoints: number;
  starts: number;
  bench: number;
}

interface PlayerStats {
  seasonsPlayed: number;
  totalGames: number;
  totalStarts: number;
  totalBench: number;
  totalPoints: number;
  averagePoints: number;
  highestScore: number;
  highestScoreGame: PlayerPerformance | null;
  ownerStats: OwnerStats[];
  performances: PlayerPerformance[];
  achievements: {
    playoffGames: number;
    finalsAppearances: number;
    finalsWins: number;
  };
}

// Ownership Table Component
const OwnershipTable = ({ data }: { data: OwnerStats[] }) => {
  const { number } = useFormatter();

  const columnHelper = createColumnHelper<OwnerStats>();
  const columns = useMemo(
    () => [
      columnHelper.accessor("teamName", {
        header: "Team",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("gamesPlayed", {
        header: "Games",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
      }),
      columnHelper.accessor("starts", {
        header: "Starts",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
      }),
      columnHelper.accessor("bench", {
        header: "Bench",
        cell: (info) => info.getValue(),
        sortingFn: "basic",
      }),
      columnHelper.accessor("totalPoints", {
        header: "Total Points",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 1 }),
        sortingFn: "basic",
      }),
      columnHelper.accessor("averagePoints", {
        header: "Avg Points",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "basic",
      }),
    ],
    [columnHelper, number]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: "gamesPlayed", desc: true }],
    },
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`py-2 ${
                    header.column.getCanSort()
                      ? "cursor-pointer select-none"
                      : ""
                  } ${header.id === "teamName" ? "text-left" : "text-right"}`}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="inline-flex items-center gap-1">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getCanSort() && (
                      <span className="text-gray-400">
                        {header.column.getIsSorted() === "asc"
                          ? "↑"
                          : header.column.getIsSorted() === "desc"
                          ? "↓"
                          : "↕"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, idx) => (
            <tr key={row.id} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`py-2 ${
                    cell.column.id === "teamName"
                      ? "text-left font-medium"
                      : "text-right"
                  }`}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PlayerDetail = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const { number } = useFormatter();
  const [showAllPerformances, setShowAllPerformances] = useState(false);

  // Extract nicknames from all seasons' roster data
  const { allNicknames } = useMemo(() => {
    const nicknames: Array<{
      nickname: string;
      managerName: string;
      year: number;
    }> = [];

    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);
      seasonData.rosters?.forEach((roster) => {
        if (roster.metadata) {
          const nicknameKey = `p_nick_${playerId}`;
          const nickname = roster.metadata[nicknameKey];
          if (nickname && nickname.trim() !== "") {
            const manager = managers.find(
              (m) => m.sleeper.id === roster.owner_id
            );
            if (manager) {
              nicknames.push({
                nickname: nickname.trim(),
                managerName: manager.name,
                year,
              });
            }
          }
        }
      });
    });

    // Get all unique nicknames with their manager and year info for the header
    const allNicknames = nicknames.reduce((acc, item) => {
      const existing = acc.find((n) => n.nickname === item.nickname);
      if (!existing) {
        acc.push({
          nickname: item.nickname,
          managerName: item.managerName,
          year: item.year,
        });
      }
      return acc;
    }, [] as Array<{ nickname: string; managerName: string; year: number }>);

    return { allNicknames };
  }, [playerId]);

  // Helper function to get position for string-named players from matchup data
  const getPlayerPositionFromMatchups = (playerId: string): string => {
    // Look through all seasons to find position information for this player
    for (const [, seasonData] of Object.entries(seasons)) {
      for (const [, weekMatchups] of Object.entries(
        seasonData.matchups || {}
      )) {
        for (const matchup of weekMatchups) {
          if (
            matchup.unmatched_players &&
            matchup.unmatched_players[playerId]
          ) {
            return matchup.unmatched_players[playerId];
          }
        }
      }
    }
    return "UNK";
  };

  const player = useMemo(() => {
    if (!playerId) return null;
    const playerData = getPlayer(playerId);

    // If player has unknown position, try to get it from matchup data
    if (playerData && playerData.position === "UNK") {
      const positionFromMatchups = getPlayerPositionFromMatchups(playerId);
      if (positionFromMatchups !== "UNK") {
        return {
          ...playerData,
          position: positionFromMatchups,
          fantasy_positions: [positionFromMatchups],
        };
      }
    }

    return playerData;
  }, [playerId]);

  const playerStats = useMemo((): PlayerStats | null => {
    if (!player || !playerId) return null;

    const performances: PlayerPerformance[] = [];
    const ownerMap = new Map<string, OwnerStats>();
    let highestScore = 0;
    let highestScoreGame: PlayerPerformance | null = null;
    let playoffGames = 0;
    let finalsAppearances = 0;
    let finalsWins = 0;

    // Iterate through all seasons
    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);
      const playoffWeekStart =
        seasonData.league?.settings?.playoff_week_start || 15;

      // Don't filter by rosters.json - it only shows final state, not historical
      // We'll check matchups directly to find where the player actually played

      // Track playoff/finals appearances for this season (count actual games, not seasons)

      // Iterate through matchups
      Object.entries(seasonData.matchups || {}).forEach(
        ([weekStr, weekMatchups]) => {
          const week = parseInt(weekStr);
          const isPlayoffWeek = week >= playoffWeekStart;

          weekMatchups.forEach((matchup) => {
            // Check if player was in this matchup
            const playerPoints = matchup.players_points?.[playerId];
            if (playerPoints === undefined) return;

            // Find the roster this player was on for this matchup
            const roster = seasonData.rosters?.find(
              (r) => r.roster_id === matchup.roster_id
            );
            if (!roster) return;

            const wasStarted = matchup.starters?.includes(playerId) || false;
            const teamName = getTeamName(roster.owner_id, seasonData.users);

            // Find opponent - look for the other matchup with the same matchup_id but different roster_id
            const opponentMatchup = weekMatchups.find(
              (m) =>
                m.matchup_id === matchup.matchup_id &&
                m.roster_id !== matchup.roster_id
            );
            const opponent = opponentMatchup
              ? (() => {
                  const opponentRoster = seasonData.rosters?.find(
                    (r) => r.roster_id === opponentMatchup.roster_id
                  );
                  return opponentRoster
                    ? getTeamName(opponentRoster.owner_id, seasonData.users)
                    : "Unknown Team";
                })()
              : "Unknown";

            // Check if this is a playoff week game that should be excluded
            let isExcludedPlayoffGame = false;
            if (isPlayoffWeek && seasonData.winners_bracket) {
              const bracketMatch = seasonData.winners_bracket.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );

              if (bracketMatch) {
                // Team is in a bracket game
                if (bracketMatch.p && bracketMatch.p !== 1) {
                  // This is a consolation game (p: 3, 5, etc.) - exclude from performances
                  isExcludedPlayoffGame = true;
                }
              } else {
                // Team is not in any bracket game for this playoff week - exclude
                isExcludedPlayoffGame = true;
              }
            }

            // Only add to performances if it's not an excluded playoff game
            if (!isExcludedPlayoffGame) {
              const performance: PlayerPerformance = {
                year,
                week,
                opponent,
                points: playerPoints,
                wasStarted,
                matchupId: matchup.matchup_id,
                ownerId: roster.owner_id,
                teamName,
              };

              performances.push(performance);
            }

            // Track highest score (only for non-excluded playoff games)
            if (!isExcludedPlayoffGame && playerPoints > highestScore) {
              highestScore = playerPoints;
              highestScoreGame = {
                year,
                week,
                opponent,
                points: playerPoints,
                wasStarted,
                matchupId: matchup.matchup_id,
                ownerId: roster.owner_id,
                teamName,
              };
            }

            // Track playoff/finals (only count meaningful winners_bracket games)
            if (isPlayoffWeek && seasonData.winners_bracket) {
              const bracketMatch = seasonData.winners_bracket.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );

              if (bracketMatch) {
                // Only count as playoff appearance if it's an elimination or championship game
                // Exclude consolation games (p: 3, 5, etc.)
                const isMeaningfulGame =
                  !bracketMatch.p || bracketMatch.p === 1;
                if (isMeaningfulGame) {
                  playoffGames++; // Count each playoff game, not just seasons
                }

                // Check if this is a championship game
                if (bracketMatch.p === 1) {
                  finalsAppearances++; // Count each finals game
                  // Check if this team won the championship
                  if (matchup.points > (opponentMatchup?.points || 0)) {
                    finalsWins++; // Count each championship win
                  }
                }
              }
            }

            // Update owner stats (only for non-excluded playoff games)
            if (!isExcludedPlayoffGame) {
              if (!ownerMap.has(roster.owner_id)) {
                ownerMap.set(roster.owner_id, {
                  ownerId: roster.owner_id,
                  teamName,
                  gamesPlayed: 0,
                  totalPoints: 0,
                  averagePoints: 0,
                  starts: 0,
                  bench: 0,
                });
              }

              const ownerStats = ownerMap.get(roster.owner_id)!;
              ownerStats.gamesPlayed++;
              ownerStats.totalPoints += playerPoints;
              if (wasStarted) {
                ownerStats.starts++;
              } else if (playerPoints > 0) {
                // Only count as bench if player scored points (exclude 0-point bench games)
                ownerStats.bench++;
              }
            }
          });
        }
      );

      // Achievements are now counted per game, not per season
    });

    // Mark bye weeks (first 0-point bench game per year, week 4 or later) in performances
    const performancesWithBye = performances.map((performance) => {
      // Only consider bench games (not started) with 0 points as potential bye weeks
      if (performance.wasStarted || performance.points > 0) {
        return {
          ...performance,
          isByeWeek: false,
        };
      }

      // Only consider weeks 4-14 as potential bye weeks (NFL bye weeks typically occur weeks 4-14)
      if (performance.week < 4 || performance.week > 14) {
        return {
          ...performance,
          isByeWeek: false,
        };
      }

      // Group bench 0-point games by year (weeks 4-14) to track bye weeks per year
      const yearPerformances = performances.filter(
        (p) =>
          p.year === performance.year &&
          !p.wasStarted &&
          p.points === 0 &&
          p.week >= 4 &&
          p.week <= 14
      );
      const isFirstZeroBenchInYear =
        yearPerformances.findIndex(
          (p) =>
            p.week === performance.week && p.ownerId === performance.ownerId
        ) === 0;

      return {
        ...performance,
        isByeWeek: isFirstZeroBenchInYear,
      };
    });

    // Recalculate owner stats with bye week logic
    const ownerMapWithBye = new Map<string, OwnerStats>();
    performancesWithBye.forEach((performance) => {
      if (!ownerMapWithBye.has(performance.ownerId)) {
        ownerMapWithBye.set(performance.ownerId, {
          ownerId: performance.ownerId,
          teamName: performance.teamName,
          gamesPlayed: 0,
          totalPoints: 0,
          averagePoints: 0,
          starts: 0,
          bench: 0,
        });
      }
      const ownerStats = ownerMapWithBye.get(performance.ownerId)!;
      ownerStats.totalPoints += performance.points;
      if (performance.wasStarted) {
        ownerStats.starts++;
      } else if (!performance.wasStarted && !performance.isByeWeek) {
        ownerStats.bench++;
      }
    });

    // Calculate averages for owner stats (games = starts + bench, average = points / games)
    const ownerStats = Array.from(ownerMapWithBye.values()).map((stats) => {
      const gamesPlayed = stats.starts + stats.bench;
      return {
        ...stats,
        gamesPlayed,
        averagePoints: gamesPlayed > 0 ? stats.totalPoints / gamesPlayed : 0,
      };
    });

    const totalStarts = performancesWithBye.filter((p) => p.wasStarted).length;
    // Only count bench games that are not bye weeks
    const totalBench = performancesWithBye.filter(
      (p) => !p.wasStarted && !p.isByeWeek
    ).length;
    const totalGames = totalStarts + totalBench;
    const totalPoints = performancesWithBye.reduce(
      (sum, p) => sum + p.points,
      0
    );
    const averagePoints = totalGames > 0 ? totalPoints / totalGames : 0;

    return {
      seasonsPlayed: new Set(performancesWithBye.map((p) => p.year)).size,
      totalGames,
      totalStarts,
      totalBench,
      totalPoints,
      averagePoints,
      highestScore,
      highestScoreGame,
      ownerStats: ownerStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed),
      performances: performancesWithBye.sort(
        (a, b) => b.year - a.year || b.week - a.week
      ),
      achievements: {
        playoffGames,
        finalsAppearances,
        finalsWins,
      },
    };
  }, [player, playerId]);

  if (!player || !playerStats) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Player Not Found
          </h1>
          <p className="text-gray-600">
            The requested player could not be found.
          </p>
        </div>
      </div>
    );
  }

  const playerImageUrl = getPlayerImageUrl(playerId!, player.position);

  return (
    <div className="container mx-auto py-8">
      {/* Back Link */}
      <div className="mb-4">
        <Link
          to="/players"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Players
        </Link>
      </div>

      {/* Player Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center gap-6">
          <div className="flex-shrink-0">
            {playerImageUrl ? (
              <img
                src={playerImageUrl}
                alt={`${player.full_name || player.last_name} photo`}
                className="w-24 h-24 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-500">
                {(player.full_name || player.last_name || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {player.full_name || `${player.first_name} ${player.last_name}`}
            </h1>
            {allNicknames.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {allNicknames.map((nicknameData) => (
                  <span
                    key={nicknameData.nickname}
                    className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm cursor-help relative group"
                    title={`${nicknameData.managerName} (${nicknameData.year})`}
                  >
                    "{nicknameData.nickname}"
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                      {nicknameData.managerName} ({nicknameData.year})
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                    </div>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 text-lg text-gray-600">
              <span className="font-medium">{player.position}</span>
              {player.team && (
                <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                  {player.team}
                </span>
              )}
              {player.number && (
                <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                  #{player.number}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Seasons Played
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.seasonsPlayed}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Games
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalGames}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Starts</h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalStarts}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Bench</h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalBench}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Points
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.totalPoints, { maximumFractionDigits: 1 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Average Points
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.averagePoints, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Highest Score
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.highestScore, { maximumFractionDigits: 2 })}
          </p>
          {playerStats.highestScoreGame && (
            <p className="text-sm text-gray-600 mt-1">
              vs {playerStats.highestScoreGame.opponent} (
              {playerStats.highestScoreGame.year}, Week{" "}
              {playerStats.highestScoreGame.week})
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Start Rate</h3>
          <p className="text-3xl font-bold text-gray-900">
            {(() => {
              const totalActiveGames =
                playerStats.totalStarts + playerStats.totalBench;
              return totalActiveGames > 0
                ? `${Math.round(
                    (playerStats.totalStarts / totalActiveGames) * 100
                  )}%`
                : "0%";
            })()}
          </p>
        </div>
      </div>

      {/* Achievements */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Achievements</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {playerStats.achievements.playoffGames}
            </div>
            <div className="text-sm text-gray-600">Playoff Games</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-600">
              {playerStats.achievements.finalsAppearances}
            </div>
            <div className="text-sm text-gray-600">Finals</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {playerStats.achievements.finalsWins}
            </div>
            <div className="text-sm text-gray-600">Championships</div>
          </div>
        </div>
      </div>

      {/* Ownership Breakdown */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Ownership Breakdown
        </h2>
        <OwnershipTable data={playerStats.ownerStats} />
      </div>

      {/* Performances Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Game Performances</h2>
          <button
            onClick={() => setShowAllPerformances(!showAllPerformances)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {showAllPerformances
              ? "Show Less"
              : `Show All (${playerStats.performances.length})`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Year</th>
                <th className="text-left py-2">Week</th>
                <th className="text-left py-2">Team</th>
                <th className="text-left py-2">Opponent</th>
                <th className="text-right py-2">Points</th>
                <th className="text-center py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {(showAllPerformances
                ? playerStats.performances
                : playerStats.performances.slice(0, 10)
              ).map((performance, idx) => (
                <tr
                  key={`${performance.year}-${performance.week}-${performance.ownerId}`}
                  className={idx % 2 === 0 ? "bg-gray-50" : ""}
                >
                  <td className="py-2">{performance.year}</td>
                  <td className="py-2">{performance.week}</td>
                  <td className="py-2 font-medium">{performance.teamName}</td>
                  <td className="py-2">{performance.opponent}</td>
                  <td className="py-2 text-right font-semibold">
                    {performance.isByeWeek
                      ? "—"
                      : number(performance.points, {
                          maximumFractionDigits: 2,
                        })}
                  </td>
                  <td className="py-2 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        performance.isByeWeek
                          ? "bg-blue-100 text-blue-800"
                          : performance.wasStarted
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {performance.isByeWeek
                        ? "Bye"
                        : performance.wasStarted
                        ? "Yes"
                        : "No"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAllPerformances && playerStats.performances.length > 10 && (
          <div className="text-center mt-4">
            <p className="text-sm text-gray-600">
              Showing 10 of {playerStats.performances.length} games
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerDetail;
