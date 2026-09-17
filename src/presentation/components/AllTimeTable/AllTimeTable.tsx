import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { seasons } from "@/data";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getCumulativeStandings, TeamStats } from "@/utils/standings";
import { DataTable } from "../Table";

// Get the most recent season's active teams
const mostRecentSeason = Object.entries(seasons).sort(
  (a, b) => Number(b[0]) - Number(a[0])
)[0][1];
const activeTeamIds = new Set(
  mostRecentSeason.rosters.map((roster) => roster.owner_id)
);

const AllTimeTable = () => {
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  useAllSeasons();
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
      cell: (info) => info.getValue(),
      header: () => "Team",
      enableSorting: false,
      meta: {
        kind: "manager" as const,
        ownerId: (row: TeamStats) => row.owner_id,
        cellClassName: "font-medium",
      },
    }),
    columnHelper.accessor("wins", {
      header: () => "Wins",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("losses", {
      header: () => "Losses",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("ties", {
      header: () => "Ties",
      cell: (info) => number(info.getValue()),
      sortingFn: "alphanumeric",
      enableSorting: true,
      meta: { kind: "numeric" as const },
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
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("points_for", {
      header: () => "For",
      cell: (info) => number(info.getValue()),
      sortingFn: (rowA, rowB) =>
        rowA.original.points_for - rowB.original.points_for,
      enableSorting: true,
      meta: { kind: "points" as const },
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
      meta: { kind: "points" as const },
    }),
    columnHelper.accessor("points_against", {
      header: () => "Against",
      cell: (info) => number(info.getValue()),
      sortingFn: (rowA, rowB) =>
        rowA.original.points_against - rowB.original.points_against,
      enableSorting: true,
      meta: { kind: "points" as const },
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
      meta: { kind: "points" as const },
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
      meta: { align: "center" as const },
    }),
  ];

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

        <DataTable
          columns={columns}
          data={filteredData}
          // Tiers colour the rows by rank, and zebra striping fights that.
          zebra={!showTiers}
          // Legacy Tailwind palette, deliberately: the token set has no ordinal
          // band scale, and `series-*` at low alpha would composite twice under
          // the pinned column. Keeping the old values means no visual change.
          getRowBackground={(_row, index) => {
            if (!showTiers) return undefined;
            if (index < 3) return "bg-green-50";
            if (index < 6) return "bg-blue-50";
            if (index < 9) return "bg-yellow-50";
            return "bg-red-50";
          }}
          emptyMessage="No seasons selected."
        />
      </div>
    </div>
  );
};

export default AllTimeTable;
