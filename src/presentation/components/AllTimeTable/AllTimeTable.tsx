import { useFormatter } from "use-intl";
import { Link } from "react-router-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { seasons } from "@/data";
import { getCumulativeStandings, TeamStats } from "@/utils/standings";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "../Table";

// Get the most recent season's active teams
const mostRecentSeason = Object.entries(seasons).sort(
  (a, b) => Number(b[0]) - Number(a[0])
)[0][1];
const activeTeamIds = new Set(
  mostRecentSeason.rosters.map((roster) => roster.owner_id)
);

const AllTimeTable = () => {
  const [showOnlyActiveTeams, setShowOnlyActiveTeams] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [showTiers, setShowTiers] = useState(false);
  const { number } = useFormatter();

  const columnHelper = createColumnHelper<TeamStats>();

  const years = useMemo(() => {
    if (showTiers) {
      // When tiers are active, use the last 3 seasons
      const allYears = Object.keys(seasons)
        .map((year) => Number(year))
        .sort((a, b) => b - a);
      return allYears.slice(0, 3);
    }
    return selectedYears.length === 0
      ? Object.keys(seasons).map((year) => Number(year))
      : selectedYears;
  }, [selectedYears, showTiers]);

  const stats = useMemo(() => {
    return getCumulativeStandings(years);
  }, [years]);

  const filteredData = useMemo(() => {
    const data =
      showOnlyActiveTeams || showTiers
        ? stats.filter((team) => activeTeamIds.has(team.owner_id))
        : stats;

    // Sort by points for for tier coloring
    if (showTiers) {
      return [...data].sort((a, b) => b.points_for - a.points_for);
    }

    return data;
  }, [showOnlyActiveTeams, showTiers, stats]);

  const columns = [
    columnHelper.accessor("team_name", {
      cell: (info) => {
        const row = info.row.original;
        const managerId = getManagerIdBySleeperOwnerId(row.owner_id);

        return (
          <div className="text-left">
            {managerId ? (
              <Link
                to={`/managers/${managerId}`}
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
              >
                {info.getValue()}
              </Link>
            ) : (
              <span>{info.getValue()}</span>
            )}
          </div>
        );
      },
      header: () => <span className="mr-auto">Team</span>,
      enableSorting: false,
    }),
    columnHelper.accessor("wins", {
      header: () => "Wins",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("losses", {
      header: () => "Losses",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("ties", {
      header: () => "Ties",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
    }),
    columnHelper.accessor("winPerc", {
      header: () => "Win %",
      cell: (info) => {
        const value = info.getValue() / 100;
        const formatted = number(value, {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        });
        // Remove leading zero if present (e.g., "0.500" -> ".500")
        return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
      },
      sortingFn: (rowA, rowB) => rowA.original.winPerc - rowB.original.winPerc,
      enableSorting: true,
    }),
    columnHelper.accessor("points_for", {
      header: () => "For",
      cell: (info) => number(info.getValue()),
      sortingFn: (rowA, rowB) =>
        rowA.original.points_for - rowB.original.points_for,
      enableSorting: true,
    }),
    columnHelper.accessor("points_for_avg", {
      header: () => "Avg.",
      cell: (info) =>
        number(info.getValue(), {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }),
      sortingFn: (rowA, rowB) =>
        rowA.original.points_for_avg - rowB.original.points_for_avg,
      enableSorting: true,
    }),
    columnHelper.accessor("points_against", {
      header: () => "Against",
      cell: (info) => number(info.getValue()),
      sortingFn: (rowA, rowB) =>
        rowA.original.points_against - rowB.original.points_against,
      enableSorting: true,
    }),
    columnHelper.accessor("points_against_avg", {
      header: () => "Avg.",
      cell: (info) =>
        number(info.getValue(), {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }),
      sortingFn: (rowA, rowB) =>
        rowA.original.points_against_avg - rowB.original.points_against_avg,
      enableSorting: true,
    }),
    columnHelper.accessor("champion", {
      header: () => "Trophies",
      cell: (info) => {
        const row = info.row.original;
        const accolades = [];

        if (row.champion?.length > 0)
          accolades.push(row.champion.map(() => "🏆"));
        if (row.runnerUp?.length > 0)
          accolades.push(row.runnerUp.map(() => "🥈"));
        if (row.scoringCrown?.length > 0)
          accolades.push(row.scoringCrown.map(() => "🎯"));

        return accolades.flat().join("");
      },
      enableSorting: false,
    }),
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="container mx-auto space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow overflow-hidden p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1 select-none cursor-pointer">
              <input
                id="showOnlyActiveTeams"
                type="checkbox"
                checked={showOnlyActiveTeams}
                onChange={() => setShowOnlyActiveTeams(!showOnlyActiveTeams)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="whitespace-nowrap text-sm text-gray-700">
                Show only active teams
              </span>
            </label>
            <label className="flex items-center gap-1 select-none cursor-pointer">
              <input
                id="showTiers"
                type="checkbox"
                checked={showTiers}
                onChange={() => {
                  setShowTiers(!showTiers);
                  if (!showTiers) {
                    // When enabling tiers, also enable active teams
                    setShowOnlyActiveTeams(true);
                  }
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="whitespace-nowrap text-sm text-gray-700">
                Tiers
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.keys(seasons).map((year) => (
              <button
                key={year}
                className={`text-xs border rounded-md px-2 py-1 hover:bg-opacity-80 ${
                  selectedYears.includes(Number(year))
                    ? "bg-blue-800 text-white border-white/50"
                    : "border-gray-200 "
                }`}
                onClick={() =>
                  setSelectedYears(
                    selectedYears.includes(Number(year))
                      ? selectedYears.filter((y) => y !== Number(year))
                      : [...selectedYears, Number(year)]
                  )
                }
              >
                {year}
              </button>
            ))}
            <button
              className="text-xs underline rounded-md px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setSelectedYears([])}
              disabled={selectedYears.length === 0}
            >
              {"Reset"}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            All-Time Standings
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Cumulative statistics across all seasons
          </p>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHeaderCell
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`text-right ${
                      header.column.getCanSort()
                        ? "cursor-pointer hover:bg-gray-100"
                        : ""
                    }`}
                    isSorted={!!header.column.getIsSorted()}
                  >
                    <div className="flex items-center justify-end">
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
            {table.getRowModel().rows.map((row, index) => {
              let tierClass = "";
              if (showTiers) {
                if (index < 3) {
                  tierClass = "bg-green-50"; // Top 3 - pale green
                } else if (index < 6) {
                  tierClass = "bg-blue-50"; // Second 3 - pale blue
                } else if (index < 9) {
                  tierClass = "bg-yellow-50"; // Next 3 - pale yellow
                } else {
                  tierClass = "bg-red-50"; // Bottom 3 - pale red
                }
              }

              return (
                <TableRow key={row.id} className={tierClass}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-right">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AllTimeTable;
