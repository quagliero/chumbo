import { useState } from "react";
import { useFormatter } from "use-intl";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../Table";

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

  const displayedPerformances = showAllPerformances
    ? performances
    : performances.slice(0, 10);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Game Performances</h2>
        <button
          onClick={() => setShowAllPerformances(!showAllPerformances)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          {showAllPerformances
            ? "Show Less"
            : `Show All (${performances.length})`}
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
          {displayedPerformances.map((performance) => (
            <TableRow
              key={`${performance.year}-${performance.week}-${performance.ownerId}`}
              className={
                performance.isChampionshipGame
                  ? "bg-green-50"
                  : performance.isPlayoffGame
                  ? "bg-yellow-50"
                  : ""
              }
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

      {!showAllPerformances && performances.length > 10 && (
        <div className="text-center pt-4 pb-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Showing 10 of {performances.length} games
          </p>
        </div>
      )}
    </div>
  );
};

export default PerformanceTable;
