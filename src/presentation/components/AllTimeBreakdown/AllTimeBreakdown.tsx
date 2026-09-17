import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { seasons } from "@/data";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { getTeamName } from "@/utils/teamName";
import {
  calculateWinPercentage,
  getRosterPointsFor,
  calculateWeeklyLeagueRecord,
  roundToTwoDecimals,
} from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { CURRENT_YEAR } from "@/domain/constants";
import { DataTable } from "../Table";

// Get the most recent season's active teams
const mostRecentSeason = Object.entries(seasons).sort(
  (a, b) => Number(b[0]) - Number(a[0])
)[0][1];
const activeTeamIds = new Set(
  mostRecentSeason.rosters.map((roster) => roster.owner_id.toString())
);

interface AllTimeBreakdownStats {
  owner_id: string;
  team_name: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPoints: number;
  winPercentage: number;
}

const AllTimeBreakdown = () => {
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  useAllSeasons();
  const [showOnlyActiveTeams, setShowOnlyActiveTeams] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const { number } = useFormatter();

  const columnHelper = createColumnHelper<AllTimeBreakdownStats>();

  const years = useMemo(() => {
    return selectedYears.length === 0
      ? Object.keys(seasons).map((year) => Number(year))
      : selectedYears;
  }, [selectedYears]);

  const stats = useMemo(() => {
    const teamStats = new Map<string, AllTimeBreakdownStats>();

    // Process each year
    years.forEach((year) => {
      const seasonData = seasons[year];
      if (!seasonData?.rosters || !seasonData?.matchups) return;

      const rosters = seasonData.rosters as ExtendedRoster[];
      const matchups = seasonData.matchups as {
        [key: string]: ExtendedMatchup[];
      };

      // Get playoff week start to filter out playoff games
      const playoffWeekStart =
        seasonData.league?.settings?.playoff_week_start || 15;

      // Get all regular season weeks (only completed ones for current year)
      const regularSeasonWeeks = Object.keys(matchups)
        .map(Number)
        .filter(
          (week) =>
            week < playoffWeekStart &&
            (year === CURRENT_YEAR
              ? isWeekCompleted(week, seasonData.league)
              : true)
        )
        .sort((a, b) => a - b);

      // Process each roster
      rosters.forEach((roster) => {
        if (!teamStats.has(roster.owner_id)) {
          teamStats.set(roster.owner_id, {
            owner_id: roster.owner_id,
            team_name: getTeamName(roster.owner_id),
            totalWins: 0,
            totalLosses: 0,
            totalTies: 0,
            totalPoints: 0,
            winPercentage: 0,
          });
        }

        const teamStat = teamStats.get(roster.owner_id)!;

        // Calculate weekly records against the league for this roster
        regularSeasonWeeks.forEach((week) => {
          const weeklyRecord = calculateWeeklyLeagueRecord(
            roster,
            week,
            matchups
          );

          // Add to totals
          teamStat.totalWins += weeklyRecord.wins;
          teamStat.totalLosses += weeklyRecord.losses;
          teamStat.totalTies += weeklyRecord.ties;
        });

        // Add total points
        teamStat.totalPoints = roundToTwoDecimals(
          teamStat.totalPoints + getRosterPointsFor(roster)
        );
      });
    });

    // Calculate win percentages
    const result = Array.from(teamStats.values()).map((stat) => {
      return {
        ...stat,
        winPercentage: calculateWinPercentage(
          stat.totalWins,
          stat.totalLosses,
          stat.totalTies
        ),
      };
    });

    return result;
  }, [years]);

  const filteredData = useMemo(() => {
    const data = showOnlyActiveTeams
      ? stats.filter((team) => activeTeamIds.has(team.owner_id))
      : stats;

    return data;
  }, [showOnlyActiveTeams, stats]);

  const columns = [
    columnHelper.accessor("team_name", {
      cell: (info) => info.getValue(),
      header: () => "Team",
      enableSorting: false,
      meta: {
        kind: "manager" as const,
        ownerId: (row: AllTimeBreakdownStats) => row.owner_id,
        cellClassName: "font-medium",
      },
    }),
    columnHelper.accessor("totalWins", {
      header: () => "Wins",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("totalLosses", {
      header: () => "Losses",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("totalTies", {
      header: () => "Ties",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("winPercentage", {
      header: () => "Win %",
      cell: (info) => {
        const value = info.getValue();
        const formatted = number(value, {
          maximumFractionDigits: 3,
          minimumFractionDigits: 3,
        });
        // Remove leading zero if present (e.g., "0.500" -> ".500")
        return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
      },
      sortingFn: "basic",
      enableSorting: true,
      meta: { kind: "numeric" as const },
    }),
    columnHelper.accessor("totalPoints", {
      header: () => "Total Points",
      cell: (info) =>
        number(info.getValue(), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      sortingFn: "basic",
      enableSorting: true,
      meta: { kind: "points" as const },
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
            All-Time Breakdown
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Weekly records against the league across all seasons
          </p>
        </div>

        <DataTable
          columns={columns}
          data={filteredData}
          initialSorting={[{ id: "winPercentage", desc: true }]}
          emptyMessage="No seasons selected."
        />
      </div>
    </div>
  );
};

export default AllTimeBreakdown;
