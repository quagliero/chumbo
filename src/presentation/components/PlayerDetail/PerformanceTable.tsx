import { useState, useMemo } from "react";
import { useFormatter } from "use-intl";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";
import { useNavigate } from "react-router-dom";
import { Card } from "@/presentation/components/Card";
import { gameHref } from "./PlayerStatsCardLink";

export interface PlayerPerformance {
  year: number;
  week: number;
  opponent: string;
  points: number;
  wasStarted: boolean;
  matchupId: number;
  ownerId: string;
  teamName: string;
  isByeWeek?: boolean;
  isPlayoffGame?: boolean;
  isChampionshipGame?: boolean;
  /** The player's NFL team as at this row's season, not his current one. */
  nflTeam?: string | null;
}

const columnHelper = createColumnHelper<PlayerPerformance>();

interface PerformanceTableProps {
  performances: PlayerPerformance[];
}

const PerformanceTable = ({ performances }: PerformanceTableProps) => {
  const { number } = useFormatter();
  const [showAllPerformances, setShowAllPerformances] = useState(false);
  const [selectedManager, setSelectedManager] = useState<string>("all");
  const navigate = useNavigate();
  // Get unique managers from performances
  const managers = useMemo(() => {
    const managerSet = new Set<string>();
    performances.forEach((perf) => {
      managerSet.add(perf.ownerId);
    });
    return Array.from(managerSet)
      .map((ownerId) => {
        const perf = performances.find((p) => p.ownerId === ownerId);
        return {
          ownerId,
          teamName: perf?.teamName || "Unknown",
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [performances]);

  // Filter performances by selected manager
  const filteredPerformances = useMemo(() => {
    if (selectedManager === "all") {
      return performances;
    }
    return performances.filter((perf) => perf.ownerId === selectedManager);
  }, [performances, selectedManager]);

  const displayedPerformances = showAllPerformances
    ? filteredPerformances
    : filteredPerformances.slice(0, 10);

  const columns = useMemo(
    () => [
      columnHelper.accessor("year", {
        header: "Year",
        cell: (info) => info.getValue(),
        enableSorting: false,
        // A year is a number and should have its digits line up, but it reads
        // as a label at the left edge of the row, not as a quantity.
        meta: { kind: "numeric" as const, align: "left" as const },
      }),
      columnHelper.accessor("week", {
        header: "Week",
        cell: (info) => info.getValue(),
        enableSorting: false,
        meta: { kind: "numeric" as const, align: "left" as const },
      }),
      columnHelper.accessor("nflTeam", {
        header: "NFL",
        // As at this row's season, not the player's current team (A1b).
        cell: (info) => info.getValue() ?? "—",
        enableSorting: false,
        meta: { cellClassName: "text-ink-muted" },
      }),
      columnHelper.accessor("teamName", {
        header: "Team",
        cell: (info) => info.getValue(),
        enableSorting: false,
        meta: {
          kind: "manager" as const,
          ownerId: (row: PlayerPerformance) => row.ownerId,
          cellClassName: "font-medium",
        },
      }),
      columnHelper.accessor("opponent", {
        header: "Opponent",
        cell: (info) => info.getValue(),
        enableSorting: false,
      }),
      columnHelper.accessor("points", {
        header: "Points",
        cell: (info) =>
          info.row.original.isByeWeek
            ? "—"
            : number(info.getValue(), { maximumFractionDigits: 2 }),
        enableSorting: false,
        meta: { kind: "points" as const, cellClassName: "font-semibold" },
      }),
      columnHelper.display({
        id: "started",
        header: "Started",
        cell: ({ row }) => {
          const { isByeWeek, wasStarted } = row.original;
          return (
            <span
              className={`px-2 py-1 rounded text-xs ${
                isByeWeek
                  ? "bg-blue-100 text-blue-800"
                  : wasStarted
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {isByeWeek ? "Bye" : wasStarted ? "Yes" : "No"}
            </span>
          );
        },
        meta: { align: "center" as const },
      }),
    ],
    [number]
  );

  return (
    <Card padding="none">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Game Performances</h2>
          <button
            onClick={() => setShowAllPerformances(!showAllPerformances)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {showAllPerformances
              ? "Show Less"
              : `Show All (${filteredPerformances.length})`}
          </button>
        </div>

        {/* Manager Filter Dropdown */}
        {managers.length > 1 && (
          <div className="flex items-center space-x-2">
            <label
              htmlFor="manager-filter"
              className="text-sm font-medium text-gray-700"
            >
              Filter by Manager:
            </label>
            <select
              id="manager-filter"
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">
                All Managers ({performances.length} games)
              </option>
              {managers.map((manager) => {
                const managerGames = performances.filter(
                  (p) => p.ownerId === manager.ownerId
                ).length;
                return (
                  <option key={manager.ownerId} value={manager.ownerId}>
                    {manager.teamName} ({managerGames} games)
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={displayedPerformances}
        // The rows are already the top N by points and are then sliced to ten,
        // so a column sort here would reorder that slice rather than the
        // season — which reads as a lie. Sorting stays off.
        // Playoff and championship rows carry their own colour.
        // Championship games are tinted, and a highlight reads far more
        // strongly against a uniform ground than against stripes.
        zebra={false}
        getRowBackground={(row) =>
          row.original.isChampionshipGame
            ? "bg-green-50"
            : row.original.isPlayoffGame
            ? "bg-yellow-50"
            : undefined
        }
        // Through `gameHref`, which checks the stored matchup id is a real
        // two-sided game before it becomes a URL. The row used to build the
        // URL by hand, and an unpaired team-week (matchup_id null) would have
        // sent the reader to ".../matchups/15/null". Such a row is simply not
        // clickable — no pointer, no dead end.
        isRowClickable={(performance) => gameHref(performance) !== null}
        onRowClick={(performance) => {
          const href = gameHref(performance);
          if (href) navigate(href);
        }}
        emptyMessage="No games for this filter."
      />

      {!showAllPerformances && filteredPerformances.length > 10 && (
        <div className="text-center pt-4 pb-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Showing 10 of {filteredPerformances.length} games
            {selectedManager !== "all" && (
              <span className="ml-1 text-gray-500">
                (filtered from {performances.length} total)
              </span>
            )}
          </p>
        </div>
      )}
    </Card>
  );
};

export default PerformanceTable;
