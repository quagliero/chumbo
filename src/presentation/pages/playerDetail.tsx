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
import {
  StandardTable,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "../components/Table";

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

interface DraftPick {
  year: number;
  round: number;
  pickNo: number;
  draftSlot: number;
  ownerId: string;
  teamName: string;
  managerName: string;
  position?: string;
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
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHeaderCell
                key={header.id}
                className={`${
                  header.column.getCanSort() ? "cursor-pointer select-none" : ""
                } ${header.id === "teamName" ? "text-left" : "text-right"}`}
                onClick={header.column.getToggleSortingHandler()}
                isSorted={!!header.column.getIsSorted()}
              >
                <div className="inline-flex items-center gap-1">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getCanSort() && (
                    <SortIcon
                      sortDirection={
                        header.column.getIsSorted() === "asc"
                          ? "asc"
                          : header.column.getIsSorted() === "desc"
                          ? "desc"
                          : false
                      }
                    />
                  )}
                </div>
              </TableHeaderCell>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={`${
                  cell.column.id === "teamName"
                    ? "text-left font-medium"
                    : "text-right"
                }`}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
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

  // Extract draft picks for this player
  const draftPicks = useMemo(() => {
    const picks: DraftPick[] = [];

    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);

      // Check if this season has draft data
      if (seasonData.draft && seasonData.picks) {
        // Find picks for this player
        const playerPicks = seasonData.picks.filter(
          (pick) => pick.player_id === playerId
        );

        playerPicks.forEach((pick) => {
          // Find the roster/owner who made this pick
          const roster = seasonData.rosters?.find(
            (r) => r.roster_id === pick.roster_id
          );

          if (roster) {
            const manager = managers.find(
              (m) => m.sleeper.id === roster.owner_id
            );

            if (manager) {
              picks.push({
                year,
                round: pick.round,
                pickNo: pick.pick_no,
                draftSlot: pick.draft_slot,
                ownerId: roster.owner_id,
                teamName: getTeamName(roster.owner_id, seasonData.users),
                managerName: manager.name,
                position: pick.position || pick.metadata?.position,
              });
            }
          }
        });
      }
    });

    // Sort by year, then by pick number
    return picks.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.pickNo - b.pickNo;
    });
  }, [playerId]);

  // Calculate most drafted by team
  const mostDraftedBy = useMemo(() => {
    if (draftPicks.length === 0) return null;

    const teamCounts = draftPicks.reduce((acc, pick) => {
      acc[pick.teamName] = (acc[pick.teamName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxCount = Math.max(...Object.values(teamCounts));
    const mostFrequentTeams = Object.entries(teamCounts)
      .filter(([, count]) => count === maxCount)
      .map(([teamName]) => teamName);

    return {
      teams: mostFrequentTeams,
      count: maxCount,
    };
  }, [draftPicks]);

  // Calculate earliest and latest round with pick numbers
  const draftRoundStats = useMemo(() => {
    if (draftPicks.length === 0) return null;

    const earliestRound = Math.min(...draftPicks.map((p) => p.round));
    const latestRound = Math.max(...draftPicks.map((p) => p.round));

    // Get picks for earliest round
    const earliestPicks = draftPicks.filter((p) => p.round === earliestRound);
    const earliestPickNumbers = earliestPicks.map(
      (p) => `${earliestRound}.${p.draftSlot}`
    );

    // Count occurrences of each pick number
    const earliestPickCounts = earliestPickNumbers.reduce((acc, pick) => {
      acc[pick] = (acc[pick] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Format earliest round display
    const earliestDisplay = Object.entries(earliestPickCounts)
      .map(([pick, count]) => (count > 1 ? `${pick} ${count}x` : pick))
      .join(", ");

    // Get picks for latest round
    const latestPicks = draftPicks.filter((p) => p.round === latestRound);
    const latestPickNumbers = latestPicks.map(
      (p) => `${latestRound}.${p.draftSlot}`
    );

    // Count occurrences of each pick number
    const latestPickCounts = latestPickNumbers.reduce((acc, pick) => {
      acc[pick] = (acc[pick] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Format latest round display
    const latestDisplay = Object.entries(latestPickCounts)
      .map(([pick, count]) => (count > 1 ? `${pick} ${count}x` : pick))
      .join(", ");

    return {
      earliestRound,
      earliestDisplay,
      latestRound,
      latestDisplay,
    };
  }, [draftPicks]);

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
              // Only add points if player was started
              if (wasStarted) {
                ownerStats.totalPoints += playerPoints;
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
      // Only add points if player was started
      if (performance.wasStarted) {
        ownerStats.totalPoints += performance.points;
        ownerStats.starts++;
      } else if (!performance.wasStarted && !performance.isByeWeek) {
        ownerStats.bench++;
      }
    });

    // Calculate averages for owner stats (games = starts + bench, average = points / starts only)
    const ownerStats = Array.from(ownerMapWithBye.values()).map((stats) => {
      const gamesPlayed = stats.starts + stats.bench;
      return {
        ...stats,
        gamesPlayed,
        averagePoints: stats.starts > 0 ? stats.totalPoints / stats.starts : 0,
      };
    });

    const totalStarts = performancesWithBye.filter((p) => p.wasStarted).length;
    // Only count bench games that are not bye weeks
    const totalBench = performancesWithBye.filter(
      (p) => !p.wasStarted && !p.isByeWeek
    ).length;
    const totalGames = totalStarts + totalBench;
    // Only include points from games where the player started
    const totalPoints = performancesWithBye
      .filter((p) => p.wasStarted)
      .reduce((sum, p) => sum + p.points, 0);
    const averagePoints = totalStarts > 0 ? totalPoints / totalStarts : 0;

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

  // Calculate ownership statistics
  const ownershipStats = useMemo(() => {
    if (!playerStats || playerStats.ownerStats.length === 0) return null;

    const totalOwners = playerStats.ownerStats.length;

    // Find owner with most starts
    const mostStartsOwner = playerStats.ownerStats.reduce((max, owner) =>
      owner.starts > max.starts ? owner : max
    );

    // Find owner with most points
    const mostPointsOwner = playerStats.ownerStats.reduce((max, owner) =>
      owner.totalPoints > max.totalPoints ? owner : max
    );

    // Find owner with best average
    const bestAverageOwner = playerStats.ownerStats.reduce((max, owner) =>
      owner.averagePoints > max.averagePoints ? owner : max
    );

    return {
      totalOwners,
      mostStarts: {
        count: mostStartsOwner.starts,
        manager: mostStartsOwner.teamName,
      },
      mostPoints: {
        amount: mostPointsOwner.totalPoints,
        manager: mostPointsOwner.teamName,
      },
      bestAverage: {
        amount: bestAverageOwner.averagePoints,
        manager: bestAverageOwner.teamName,
      },
    };
  }, [playerStats]);

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
    <div className="container mx-auto py-8 space-y-6">
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
      <div className="">
        <div className="flex items-center gap-6">
          <div className="flex-shrink-0">
            {playerImageUrl ? (
              <img
                src={playerImageUrl}
                alt={`${player.full_name || player.last_name} photo`}
                className={`w-24 h-24 object-cover ${
                  player.position === "DEF" ? "" : "rounded-full"
                }`}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Seasons Played
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.seasonsPlayed}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Games
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalGames}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Starts</h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalStarts}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Bench</h3>
          <p className="text-3xl font-bold text-gray-900">
            {playerStats.totalBench}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Total Points
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.totalPoints, { maximumFractionDigits: 1 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Average Points
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.averagePoints, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Highest Score
          </h3>
          <p className="text-3xl font-bold text-gray-900">
            {number(playerStats.highestScore, { maximumFractionDigits: 2 })}
          </p>
          {playerStats.highestScoreGame && (
            <div className="mt-1">
              <p className="text-sm text-gray-600">
                vs {playerStats.highestScoreGame.opponent} (
                {playerStats.highestScoreGame.year}, Week{" "}
                {playerStats.highestScoreGame.week})
              </p>
              {!playerStats.highestScoreGame.wasStarted && (
                <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                  On the Bench!
                </span>
              )}
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
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
      <div className="bg-white rounded-lg shadow overflow-hidden p-6">
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-xl font-bold text-gray-900 px-6 py-4  border-b border-gray-200">
          Ownership Breakdown
        </h2>
        <OwnershipTable data={playerStats.ownerStats} />

        {/* Ownership Statistics */}
        {ownershipStats && (
          <div className="border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Total Owners
              </h3>
              <p className="text-2xl font-bold text-gray-900">
                {ownershipStats.totalOwners}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">Most Starts</h3>
              <p className="text-lg font-bold text-gray-900">
                {ownershipStats.mostStarts.count}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({ownershipStats.mostStarts.manager})
                </span>
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">Most Points</h3>
              <p className="text-lg font-bold text-gray-900">
                {number(ownershipStats.mostPoints.amount, {
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({ownershipStats.mostPoints.manager})
                </span>
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Best Average
              </h3>
              <p className="text-lg font-bold text-gray-900">
                {number(ownershipStats.bestAverage.amount, {
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-normal text-gray-600 ml-1">
                  ({ownershipStats.bestAverage.manager})
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Draft Breakdown Table */}
      {draftPicks.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <h2 className="text-xl font-bold text-gray-900 px-6 py-4 border-b border-gray-200">
            Draft Breakdown
          </h2>
          <StandardTable
            headers={[
              { key: "year", label: "Year" },
              { key: "round", label: "Round" },
              { key: "slot", label: "Pick" },
              { key: "pick", label: "Overall" },
              { key: "team", label: "Team" },
            ]}
            rows={draftPicks.map((pick) => ({
              key: `${pick.year}-${pick.pickNo}`,
              cells: [
                { content: pick.year, className: "font-medium" },
                { content: pick.round },
                { content: pick.draftSlot },
                { content: `#${pick.pickNo}` },
                { content: pick.teamName },
              ],
            }))}
          />

          {/* Draft Statistics */}
          <div className="border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Total Drafts
              </h3>
              <p className="text-2xl font-bold text-gray-900">
                {draftPicks.length}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Most Drafted By
              </h3>
              <p className="text-lg font-bold text-gray-900">
                {mostDraftedBy ? (
                  <>
                    {mostDraftedBy.teams.join(", ")}
                    <span className="text-sm font-normal text-gray-600 ml-1">
                      ({mostDraftedBy.count}x)
                    </span>
                  </>
                ) : (
                  "N/A"
                )}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Earliest Round
              </h3>
              <p className="text-lg font-bold text-gray-900">
                {draftRoundStats ? (
                  <>
                    {draftRoundStats.earliestRound}
                    <span className="text-sm font-normal text-gray-600 ml-1">
                      ({draftRoundStats.earliestDisplay})
                    </span>
                  </>
                ) : (
                  "N/A"
                )}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">
                Latest Round
              </h3>
              <p className="text-lg font-bold text-gray-900">
                {draftRoundStats ? (
                  <>
                    {draftRoundStats.latestRound}
                    <span className="text-sm font-normal text-gray-600 ml-1">
                      ({draftRoundStats.latestDisplay})
                    </span>
                  </>
                ) : (
                  "N/A"
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Performances Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell className="text-left">Year</TableHeaderCell>
              <TableHeaderCell className="text-left">Week</TableHeaderCell>
              <TableHeaderCell className="text-left">Team</TableHeaderCell>
              <TableHeaderCell className="text-left">Opponent</TableHeaderCell>
              <TableHeaderCell className="text-right">Points</TableHeaderCell>
              <TableHeaderCell className="text-center">Started</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(showAllPerformances
              ? playerStats.performances
              : playerStats.performances.slice(0, 10)
            ).map((performance) => (
              <TableRow
                key={`${performance.year}-${performance.week}-${performance.ownerId}`}
              >
                <TableCell>{performance.year}</TableCell>
                <TableCell>{performance.week}</TableCell>
                <TableCell className="font-medium">
                  {performance.teamName}
                </TableCell>
                <TableCell>{performance.opponent}</TableCell>
                <TableCell className="text-right font-semibold">
                  {performance.isByeWeek
                    ? "—"
                    : number(performance.points, {
                        maximumFractionDigits: 2,
                      })}
                </TableCell>
                <TableCell className="text-center">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!showAllPerformances && playerStats.performances.length > 10 && (
          <div className="text-center pt-4 pb-6 border-t border-gray-200">
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
