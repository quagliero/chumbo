import { useState, useMemo } from "react";
import { useFormatter } from "use-intl";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../Table";
import { useNavigate } from "react-router-dom";

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
}

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

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
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
          {displayedPerformances.map((performance) => (
            <TableRow
              key={`${performance.year}-${performance.week}-${performance.ownerId}`}
              className={`${
                performance.isChampionshipGame
                  ? "bg-green-50"
                  : performance.isPlayoffGame
                  ? "bg-yellow-50"
                  : ""
              } cursor-pointer`}
              onClick={() => {
                navigate(
                  `/seasons/${performance.year}/matchups/${performance.week}/${performance.matchupId}`
                );
              }}
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
    </div>
  );
};

export default PerformanceTable;
