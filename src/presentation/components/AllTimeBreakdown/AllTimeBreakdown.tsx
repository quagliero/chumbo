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
import { seasons } from "../../../data";
import managers from "../../../data/managers.json";
import { ExtendedRoster } from "../../../types/roster";
import { Matchup } from "../../../types/matchup";
import { getTeamName } from "../../../utils/teamName";

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
      const matchups = seasonData.matchups as { [key: string]: Matchup[] };

      // Get playoff week start to filter out playoff games
      const playoffWeekStart =
        seasonData.league?.settings?.playoff_week_start || 15;

      // Get all regular season weeks
      const regularSeasonWeeks = Object.keys(matchups)
        .map(Number)
        .filter((week) => week < playoffWeekStart)
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
          const weekMatchups = matchups[week.toString()];
          if (!weekMatchups) return;

          const rosterMatchup = weekMatchups.find(
            (m) => m.roster_id === roster.roster_id
          );
          if (!rosterMatchup) return;

          const teamPoints = rosterMatchup.points;
          let weeklyWins = 0;
          let weeklyLosses = 0;
          let weeklyTies = 0;

          // Compare this roster's score against all other rosters this week
          weekMatchups.forEach((otherMatchup) => {
            if (otherMatchup.roster_id === roster.roster_id) return;

            if (teamPoints > otherMatchup.points) {
              weeklyWins++;
            } else if (teamPoints < otherMatchup.points) {
              weeklyLosses++;
            } else {
              weeklyTies++;
            }
          });

          // Add to totals
          teamStat.totalWins += weeklyWins;
          teamStat.totalLosses += weeklyLosses;
          teamStat.totalTies += weeklyTies;
        });

        // Add total points
        teamStat.totalPoints +=
          roster.settings.fpts + roster.settings.fpts_decimal / 100;
      });
    });

    // Calculate win percentages
    const result = Array.from(teamStats.values()).map((stat) => {
      const totalGames = stat.totalWins + stat.totalLosses + stat.totalTies;
      return {
        ...stat,
        winPercentage: totalGames > 0 ? stat.totalWins / totalGames : 0,
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
      cell: (info) => {
        const row = info.row.original;
        const manager = managers.find((m) => m.sleeper.id === row.owner_id);
        const managerId = manager?.id;

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
    columnHelper.accessor("totalWins", {
      header: () => "Wins",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
    }),
    columnHelper.accessor("totalLosses", {
      header: () => "Losses",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
    }),
    columnHelper.accessor("totalTies", {
      header: () => "Ties",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
    }),
    columnHelper.accessor("winPercentage", {
      header: () => "Win %",
      cell: (info) =>
        number(info.getValue(), {
          maximumFractionDigits: 2,
        }),
      sortingFn: "basic",
      enableSorting: true,
    }),
    columnHelper.accessor("totalPoints", {
      header: () => "Total Points",
      cell: (info) => number(info.getValue()),
      sortingFn: "basic",
      enableSorting: true,
    }),
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: "winPercentage", desc: true }],
    },
  });

  return (
    <div className="overflow-x-scroll container mx-auto">
      <table className="w-full text-right">
        <thead className="text-sm font-medium">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={
                    header.column.getCanSort()
                      ? "cursor-pointer select-none"
                      : ""
                  }
                >
                  <span className="flex justify-end whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanSort()
                      ? {
                          asc: " 🔼",
                          desc: " 🔽",
                        }[header.column.getIsSorted() as string] ?? " ↕️"
                      : ""}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="text-xs divide-y divide-gray-100">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200">
          <tr>
            <td colSpan={columns.length} className="py-2 text-left text-xs">
              <div className="flex flex-wrap justify-between gap-4">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-1 select-none cursor-pointer">
                    <input
                      id="showOnlyActiveTeams"
                      type="checkbox"
                      checked={showOnlyActiveTeams}
                      onChange={() =>
                        setShowOnlyActiveTeams(!showOnlyActiveTeams)
                      }
                    />
                    <span className="whitespace-nowrap">
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
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default AllTimeBreakdown;
