import { useFormatter } from "use-intl";
import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { getManagerStats, DataMode, H2HRecord } from "../../utils/managerStats";
import { managers, getPlayer } from "../../data";
import { getPlayerImageUrl } from "../../utils/playerImage";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "../components/Table";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

const ManagerDetail = () => {
  const { managerId, tab, section } = useParams<{
    managerId: string;
    tab?: string;
    section?: string;
  }>();
  const navigate = useNavigate();
  const { number } = useFormatter();
  const [dataMode, setDataMode] = useState<DataMode>("regular");
  const [mostDraftedDisplayCount, setMostDraftedDisplayCount] =
    useState<number>(12);
  const [mostCappedDisplayCount, setMostCappedDisplayCount] =
    useState<number>(12);
  const [performancesDisplayCount, setPerformancesDisplayCount] =
    useState<number>(12);
  const [selectedPosition, setSelectedPosition] = useState<string>("all");

  // Get current tab from URL params, default to 'summary'
  const currentTab = tab || "summary";

  // Get current player section from URL params, default to 'allstars'
  const selectedPlayerSection = section || "allstars";

  const managerStats = useMemo(() => {
    if (!managerId) return null;
    return getManagerStats(managerId, dataMode);
  }, [managerId, dataMode]);

  // Filter performances by position
  const filteredPerformances = useMemo(() => {
    if (!managerStats) return [];

    if (selectedPosition === "all") {
      return managerStats.topPerformances;
    }

    return managerStats.topPerformances.filter((performance) => {
      // Get player data to determine position
      const player = getPlayer(performance.playerId, performance.year);
      if (!player) return false;

      const position = player.position;
      if (position === "UNK") {
        // Try to find position from matchup data
        for (const year of [performance.year]) {
          const seasonData = managerStats.seasonStats.find(
            (s) => s.year === year
          );
          if (seasonData) {
            // This is a simplified check - in a real implementation you'd need to search through matchup data
            // For now, we'll skip UNK positions in filtering
            return false;
          }
        }
      }

      if (selectedPosition === "FLEX") {
        return position === "RB" || position === "WR" || position === "TE";
      }

      return position === selectedPosition;
    });
  }, [managerStats, selectedPosition]);

  // H2H table setup
  const columnHelper = createColumnHelper<{
    opponentId: string;
    record: H2HRecord;
    opponentName: string;
  }>();

  const h2hColumns = [
    columnHelper.accessor("opponentName", {
      header: () => "Manager",
      cell: (info) => {
        const row = info.row.original;
        return (
          <Link
            to={`/h2h/${managerStats?.managerId}/${row.opponentId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {info.getValue()}
          </Link>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor("record", {
      header: () => "Record",
      cell: (info) => {
        const record = info.getValue();
        return `${record.wins}-${record.losses}${
          record.ties > 0 ? `-${record.ties}` : ""
        }`;
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.record.wins;
        const b = rowB.original.record.wins;
        return a - b;
      },
      enableSorting: true,
    }),
    columnHelper.accessor("record", {
      id: "currentStreak",
      header: () => "Current Streak",
      cell: (info) => {
        const record = info.getValue();
        if (!record.currentStreak) return null;
        return (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              record.currentStreak.type === "W"
                ? "bg-green-100 text-green-800"
                : record.currentStreak.type === "L"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {record.currentStreak.type}
            {record.currentStreak.count}
          </span>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor("record", {
      id: "mostRecent",
      header: () => "Most Recent",
      cell: (info) => {
        const record = info.getValue();
        if (!record.mostRecent) return null;
        return (
          <div className="text-sm">
            <div className="font-medium">
              {record.mostRecent.year}, Week {record.mostRecent.week}
            </div>
            <div className="text-gray-500">
              {record.mostRecent.result === "W"
                ? "W"
                : record.mostRecent.result === "L"
                ? "L"
                : "T"}{" "}
              {number(record.mostRecent.pointsFor, {
                maximumFractionDigits: 2,
              })}{" "}
              -{" "}
              {number(record.mostRecent.pointsAgainst, {
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor("record", {
      id: "avgPointsFor",
      header: () => "Avg Points For",
      cell: (info) => {
        const record = info.getValue();
        return number(record.avgPointsFor, {
          maximumFractionDigits: 2,
        });
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.record.avgPointsFor;
        const b = rowB.original.record.avgPointsFor;
        return a - b;
      },
      enableSorting: true,
    }),
    columnHelper.accessor("record", {
      id: "avgPointsAgainst",
      header: () => "Avg Against",
      cell: (info) => {
        const record = info.getValue();
        return number(record.avgPointsAgainst, {
          maximumFractionDigits: 2,
        });
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.record.avgPointsAgainst;
        const b = rowB.original.record.avgPointsAgainst;
        return a - b;
      },
      enableSorting: true,
    }),
  ];

  const h2hData = useMemo(() => {
    if (!managerStats) return [];

    return Object.entries(managerStats.h2hRecords).map(
      ([opponentId, record]) => {
        const opponent = managers.find((m) => m.sleeper.id === opponentId);
        const opponentName =
          opponent?.teamName || opponent?.sleeper.display_name || "Unknown";

        return {
          opponentId,
          record,
          opponentName,
        };
      }
    );
  }, [managerStats]);

  const h2hTable = useReactTable({
    data: h2hData,
    columns: h2hColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: "record", desc: true }],
    },
  });

  // Redirect to summary tab if no tab is specified
  if (!tab && managerId) {
    return <Navigate to={`/managers/${managerId}/summary`} replace />;
  }

  // Redirect to all-stars section if on players tab but no section specified
  if (currentTab === "players" && !section && managerId) {
    return <Navigate to={`/managers/${managerId}/players/allstars`} replace />;
  }

  if (!managerStats) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600">
            Manager not found
          </h1>
          <button
            onClick={() => navigate("/managers")}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
      </div>
    );
  }

  const winPercentage =
    (managerStats.totalWins /
      (managerStats.totalWins +
        managerStats.totalLosses +
        managerStats.totalTies)) *
    100;
  const leagueWinPercentage =
    (managerStats.leagueWins /
      (managerStats.leagueWins +
        managerStats.leagueLosses +
        managerStats.leagueTies)) *
    100;

  return (
    <div className="container mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{managerStats.managerName}</h1>
          <p className="text-xl text-gray-600">{managerStats.teamName}</p>
          <button
            onClick={() => navigate("/managers")}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Data Mode:</span>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="regular">Regular Season</option>
              <option value="playoffs">Playoffs Only</option>
              <option value="combined">Regular + Playoffs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <Link
            to={`/managers/${managerId}/summary`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "summary"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Summary
          </Link>
          <Link
            to={`/managers/${managerId}/seasons`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "seasons"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Seasons
          </Link>
          <Link
            to={`/managers/${managerId}/h2h`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "h2h"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            H2H
          </Link>
          <Link
            to={`/managers/${managerId}/players/allstars`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "players"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Players
          </Link>
        </nav>
      </div>

      {/* Player Section Filter Buttons */}
      {currentTab === "players" && (
        <div className=" bg-white">
          <div className="">
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/managers/${managerId}/players/allstars`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "allstars"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All Stars
              </Link>
              <Link
                to={`/managers/${managerId}/players/drafted`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "drafted"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Most Drafted
              </Link>
              <Link
                to={`/managers/${managerId}/players/capped`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "capped"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Most Capped
              </Link>
              <Link
                to={`/managers/${managerId}/players/performances`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "performances"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Top Performances
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {currentTab === "summary" && (
        <>
          {/* Overall Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Overall Record
              </h3>
              <div className="text-3xl font-bold">
                {managerStats.totalWins}-{managerStats.totalLosses}
                {managerStats.totalTies > 0 && `-${managerStats.totalTies}`}
              </div>
              <div className="text-sm text-gray-500">
                {number(winPercentage, { maximumFractionDigits: 1 })}% win rate
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                League Performance
              </h3>
              <div className="text-3xl font-bold">
                {managerStats.leagueWins}-{managerStats.leagueLosses}
                {managerStats.leagueTies > 0 && `-${managerStats.leagueTies}`}
              </div>
              <div className="text-sm text-gray-500">
                {number(leagueWinPercentage, { maximumFractionDigits: 1 })}%
                league win rate
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Points For
              </h3>
              <div className="text-3xl font-bold">
                {number(managerStats.totalPointsFor, {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-sm text-gray-500">
                {number(
                  managerStats.totalPointsFor / managerStats.seasonStats.length,
                  {
                    maximumFractionDigits: 0,
                  }
                )}{" "}
                avg per season
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Points Against
              </h3>
              <div className="text-3xl font-bold">
                {number(managerStats.totalPointsAgainst, {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-sm text-gray-500">
                {number(
                  managerStats.totalPointsAgainst /
                    managerStats.seasonStats.length,
                  {
                    maximumFractionDigits: 0,
                  }
                )}{" "}
                avg per season
              </div>
            </div>
          </div>

          {/* Achievements */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Championships
              </h3>
              <div className="text-3xl font-bold">
                {managerStats.championships}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Finals
              </h3>
              <div className="text-3xl font-bold">
                {managerStats.runnerUps + managerStats.championships}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Scoring Crowns
              </h3>
              <div className="text-3xl font-bold">
                {managerStats.scoringCrowns}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Playoffs
              </h3>
              <div className="text-3xl font-bold">{managerStats.playoffs}</div>
            </div>
          </div>

          {/* Best Seasons */}
          <div className="bg-white p-6 rounded-lg shadow overflow-hidden">
            <h2 className="text-2xl font-bold mb-4">Best Seasons</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Most Wins</h3>
                <div className="text-2xl font-bold">
                  {managerStats.bestWinsSeason.wins} wins
                </div>
                <div className="text-gray-600">
                  {managerStats.bestWinsSeason.year}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Most Points</h3>
                <div className="text-2xl font-bold">
                  {number(managerStats.bestPointsSeason.points, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  points
                </div>
                <div className="text-gray-600">
                  {managerStats.bestPointsSeason.year}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {currentTab === "seasons" && (
        <>
          {/* Season Breakdown */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="text-2xl font-bold p-6">Season Breakdown</h2>
            <Table className="border-t border-neutral-200">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Year</TableHeaderCell>
                  <TableHeaderCell>Record</TableHeaderCell>
                  <TableHeaderCell>Standing / Points</TableHeaderCell>
                  <TableHeaderCell>Points For</TableHeaderCell>
                  <TableHeaderCell>Points Against</TableHeaderCell>
                  <TableHeaderCell>Result</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managerStats.seasonStats.map((season) => {
                  const winPercentage =
                    (season.wins /
                      (season.wins + season.losses + season.ties)) *
                    100;
                  return (
                    <TableRow
                      key={season.year}
                      onClick={() =>
                        navigate(`/history/${season.year}/standings`)
                      }
                    >
                      <TableCell className="font-medium">
                        {season.year}
                      </TableCell>
                      <TableCell>
                        {season.wins}-{season.losses}
                        {season.ties > 0 && `-${season.ties}`}
                        <div className="text-sm text-gray-500">
                          {number(winPercentage, {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              season.finalStanding === 1
                                ? "bg-yellow-100 text-yellow-800"
                                : season.finalStanding <= 4
                                ? "bg-green-100 text-green-800"
                                : season.finalStanding <= 8
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                            title="Regular season finish"
                          >
                            #{season.finalStanding}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              season.pointsStanding === 1
                                ? "bg-yellow-100 text-yellow-800"
                                : season.pointsStanding <= 4
                                ? "bg-green-100 text-green-800"
                                : season.pointsStanding <= 8
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                            title="Points scored rank"
                          >
                            #{season.pointsStanding}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {number(season.pointsFor, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        {number(season.pointsAgainst, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {season.madePlayoffs && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              Playoffs
                            </span>
                          )}
                          {season.championshipResult === "champion" && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                              🏆 Champion
                            </span>
                          )}
                          {season.championshipResult === "runner-up" && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                              Finals
                            </span>
                          )}
                          {season.scoringCrown && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                              👑 Scoring Crown
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {currentTab === "h2h" && (
        <>
          {/* H2H Records */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="text-2xl font-bold p-6">Head-to-Head Records</h2>
            <Table className="border-t border-neutral-200">
              <TableHeader>
                {h2hTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHeaderCell
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`${
                          header.column.getCanSort()
                            ? "cursor-pointer hover:bg-gray-100"
                            : ""
                        }`}
                        isSorted={!!header.column.getIsSorted()}
                      >
                        <div className="flex items-center justify-between">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
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
                              className="ml-1"
                            />
                          )}
                        </div>
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {h2hTable.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() =>
                      navigate(
                        `/h2h/${managerStats.managerId}/${row.original.opponentId}`
                      )
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {currentTab === "players" && (
        <>
          {/* Players Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden py-4">
            {/* All-Star Lineup */}
            {selectedPlayerSection === "allstars" && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 px-6">
                  All-Star Lineup
                </h3>
                <Table className="border-y border-gray-200">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Position</TableHeaderCell>
                      <TableHeaderCell>Player</TableHeaderCell>
                      <TableHeaderCell>Total Points</TableHeaderCell>
                      <TableHeaderCell>Average</TableHeaderCell>
                      <TableHeaderCell>Games</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {managerStats.allStarLineup.map((slot, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {slot.position}
                        </TableCell>
                        <TableCell>
                          {slot.player ? (
                            <div className="flex items-center">
                              {(() => {
                                const imageUrl = getPlayerImageUrl(
                                  slot.player!.playerId
                                );
                                return imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt={`${slot.player!.playerName} photo`}
                                    className="w-8 h-8 rounded-full object-cover mr-3"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-3">
                                    {(slot.player!.playerName || "?")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                );
                              })()}
                              <Link
                                to={`/players/${slot.player!.playerId}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {slot.player!.playerName}
                              </Link>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {slot.player
                            ? number(slot.player!.totalPoints, {
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {slot.player
                            ? number(slot.player!.averagePoints, {
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {slot.player ? slot.player!.games : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Most Drafted Players */}
            {selectedPlayerSection === "drafted" && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 px-6">
                  Most Drafted Players
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-6">
                  {managerStats.mostDraftedPlayers
                    .slice(0, mostDraftedDisplayCount)
                    .map((player, index) => (
                      <Link
                        key={index}
                        to={`/players/${player.playerId}`}
                        className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-all overflow-hidden cursor-pointer group block"
                      >
                        {/* Player Info */}
                        <div className="flex items-center mb-3">
                          {(() => {
                            const imageUrl = getPlayerImageUrl(player.playerId);
                            return imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={`${player.playerName} photo`}
                                className="w-10 h-10 rounded-full object-cover mr-3"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500 mr-3">
                                {(player.playerName || "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>
                            );
                          })()}
                          <div>
                            <div className="font-medium text-gray-900 text-sm">
                              {player.playerName}
                            </div>
                            <div className="text-xs text-gray-500">
                              Drafted {player.timesDrafted} times
                            </div>
                          </div>
                        </div>

                        {/* Draft Details */}
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Years:</span>
                            <span className="font-medium text-right">
                              {player.years.join(", ")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Highest Pick:</span>
                            <span className="font-medium text-right">
                              {player.bestPick.year} {player.bestPick.round}.
                              {player.bestPick.pick}
                            </span>
                          </div>
                        </div>

                        {/* Hover Effect */}
                        <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to view player →
                        </div>
                      </Link>
                    ))}
                </div>

                {/* Show More Button for Most Drafted */}
                {managerStats.mostDraftedPlayers.length >
                  mostDraftedDisplayCount && (
                  <div className="text-center mt-6 px-6">
                    <button
                      onClick={() =>
                        setMostDraftedDisplayCount((prev) => prev + 12)
                      }
                      className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
                    >
                      Show More
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Most Capped Players */}
            {selectedPlayerSection === "capped" && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 px-6">
                  Most Capped Players
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-6">
                  {managerStats.mostCappedPlayers
                    .slice(0, mostCappedDisplayCount)
                    .map((player, index) => (
                      <Link
                        key={index}
                        to={`/players/${player.playerId}`}
                        className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-all overflow-hidden cursor-pointer group block"
                      >
                        {/* Player Info */}
                        <div className="flex items-center mb-3">
                          {(() => {
                            const imageUrl = getPlayerImageUrl(player.playerId);
                            return imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={`${player.playerName} photo`}
                                className="w-10 h-10 rounded-full object-cover mr-3"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500 mr-3">
                                {(player.playerName || "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>
                            );
                          })()}
                          <div>
                            <div className="font-medium text-gray-900 text-sm">
                              {player.playerName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {player.starts} starts
                            </div>
                          </div>
                        </div>

                        {/* Stats Details */}
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Years:</span>
                            <span className="font-medium text-right">
                              {player.years.join(", ")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Avg Score:</span>
                            <span className="font-medium text-right">
                              {number(player.averageScore, {
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Hover Effect */}
                        <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to view player →
                        </div>
                      </Link>
                    ))}
                </div>

                {/* Show More Button for Most Capped */}
                {managerStats.mostCappedPlayers.length >
                  mostCappedDisplayCount && (
                  <div className="text-center mt-6 px-6">
                    <button
                      onClick={() =>
                        setMostCappedDisplayCount((prev) => prev + 12)
                      }
                      className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
                    >
                      Show More
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Top 12 All-Time Performances */}
            {selectedPlayerSection === "performances" && (
              <div>
                <div className="flex items-center justify-between mb-4 px-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Top All-Time Performances
                  </h3>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">
                      Position:
                    </label>
                    <select
                      value={selectedPosition}
                      onChange={(e) => {
                        setSelectedPosition(e.target.value);
                        setPerformancesDisplayCount(12); // Reset display count when filter changes
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Positions</option>
                      <option value="QB">QB</option>
                      <option value="RB">RB</option>
                      <option value="WR">WR</option>
                      <option value="TE">TE</option>
                      <option value="FLEX">FLEX</option>
                      <option value="K">K</option>
                      <option value="DEF">DEF</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-6">
                  {filteredPerformances
                    .slice(0, performancesDisplayCount)
                    .map((performance, index) => (
                      <Link
                        key={index}
                        to={`/history/${performance.year}/matchups/${performance.week}/${performance.matchup_id}`}
                        className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg transition-all cursor-pointer group block overflow-hidden"
                      >
                        {/* Rank Badge */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm">
                              #{index + 1}
                            </div>
                            <div className="ml-3">
                              <div className="text-lg font-bold text-gray-900">
                                {number(performance.points, {
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                              <div className="text-xs text-gray-500">
                                points
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Player Info */}
                        <div className="mb-3">
                          <div className="flex items-center mb-2">
                            {(() => {
                              const imageUrl = getPlayerImageUrl(
                                performance.playerId
                              );
                              return imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={`${performance.playerName} photo`}
                                  className="w-8 h-8 rounded-full object-cover mr-2"
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                                  {performance.playerName
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                              );
                            })()}
                            <Link
                              to={`/players/${performance.playerId}`}
                              className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-sm"
                            >
                              {performance.playerName}
                            </Link>
                          </div>
                        </div>

                        {/* Game Details */}
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>Year:</span>
                            <span className="font-medium text-right">
                              {performance.year}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Week:</span>
                            <span className="font-medium text-right">
                              {performance.week}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>vs:</span>
                            <span
                              className="font-medium truncate text-right"
                              title={performance.opponentName}
                            >
                              {performance.opponentName}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Result:</span>
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
                          </div>
                        </div>

                        {/* Hover Effect */}
                        <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to view matchup →
                        </div>
                      </Link>
                    ))}
                </div>

                {/* Show More Button for Performances */}
                {filteredPerformances.length > performancesDisplayCount && (
                  <div className="text-center mt-6 px-6">
                    <button
                      onClick={() =>
                        setPerformancesDisplayCount((prev) => prev + 12)
                      }
                      className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
                    >
                      Show More
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ManagerDetail;
