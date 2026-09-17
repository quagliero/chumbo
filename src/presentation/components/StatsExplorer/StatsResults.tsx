import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatsResult } from "@/utils/statsExplorer";
import { DataTable } from "../Table";
import type { AnyColumnDef } from "../Table";

type PositionRow = {
  position: string;
  avg: number;
  min: number;
  max: number;
};

const positionColumns: AnyColumnDef<PositionRow>[] = [
  {
    accessorKey: "position",
    header: "Position",
    meta: { cellClassName: "font-medium" },
  },
  {
    accessorKey: "avg",
    header: "Average Points",
    cell: ({ getValue }) => (getValue() as number).toFixed(1),
    meta: { kind: "points" },
  },
  {
    accessorKey: "min",
    header: "Min Points",
    cell: ({ getValue }) => (getValue() as number).toFixed(1),
    meta: { kind: "points" },
  },
  {
    accessorKey: "max",
    header: "Max Points",
    cell: ({ getValue }) => (getValue() as number).toFixed(1),
    meta: { kind: "points" },
  },
];

type MatchupRow = StatsResult["sampleMatchups"][number];

interface StatsResultsProps {
  results: StatsResult | null;
  isLoading: boolean;
}

const StatsResults: React.FC<StatsResultsProps> = ({ results, isLoading }) => {
  const navigate = useNavigate();
  const [showAllMatchups, setShowAllMatchups] = useState(false);

  const positionRows = useMemo<PositionRow[]>(
    () =>
      Object.entries(results?.positionalBreakdown ?? {}).map(
        ([position, stats]) => ({ position, ...stats })
      ),
    [results?.positionalBreakdown]
  );

  const matchupColumns = useMemo<AnyColumnDef<MatchupRow>[]>(
    () => [
      {
        accessorKey: "year",
        header: "Year",
        meta: { kind: "year", seasonTab: "matchups" },
      },
      { accessorKey: "week", header: "Week", meta: { kind: "numeric" } },
      {
        accessorKey: "points",
        header: "Points",
        cell: ({ getValue }) => (getValue() as number).toFixed(1),
        meta: { kind: "points" },
      },
      {
        accessorKey: "opponentPoints",
        header: "Opponent",
        cell: ({ getValue }) => (getValue() as number).toFixed(1),
        meta: { kind: "points" },
      },
      {
        accessorKey: "result",
        header: "Result",
        cell: ({ getValue }) => {
          const result = getValue() as string;
          return (
            <span
              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full text-white ${
                result === "W"
                  ? "bg-result-win"
                  : result === "L"
                  ? "bg-result-loss"
                  : "bg-result-tie"
              }`}
            >
              {result}
            </span>
          );
        },
        meta: { align: "center" },
      },
      {
        id: "positionalScores",
        header: "Positional Scores",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {Object.entries(row.original.positionalScores)
              .filter(([, score]) => score > 0)
              .map(([pos, score]) => (
                <span
                  key={pos}
                  className="inline-flex px-2 py-1 text-xs bg-surface-sunk rounded"
                >
                  {pos}: {score.toFixed(1)}
                </span>
              ))}
          </div>
        ),
        meta: { cellClassName: "text-ink-muted" },
      },
    ],
    []
  );

  const displayedMatchups = useMemo(() => {
    if (!results?.sampleMatchups) return [];
    // Matchups are already sorted by newest first from the backend
    // Show first 10 by default, or all when "show all" is clicked
    return showAllMatchups
      ? results.sampleMatchups
      : results.sampleMatchups.slice(0, 10);
  }, [results?.sampleMatchups, showAllMatchups]);

  const handleMatchupClick = (
    year: number,
    week: number,
    matchupId: number
  ) => {
    navigate(`/seasons/${year}/matchups/${week}/${matchupId}`);
  };
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Calculating stats...</span>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Apply filters to see results</p>
        </div>
      </div>
    );
  }

  if (results.totalMatchups === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">
            No matchups found matching your criteria
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {(results.winPercentage * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Win Percentage</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {results.totalMatchups}
            </div>
            <div className="text-sm text-gray-600">Total Matchups</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">
              {results.wins}-{results.losses}-{results.ties}
            </div>
            <div className="text-sm text-gray-600">Record (W-L-T)</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">
              {results.avgPointsFor.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">Avg Points For</div>
          </div>
        </div>
      </div>

      {/* Positional Breakdown */}
      <div className="bg-white rounded-lg shadow pt-4 overflow-hidden">
        <h3 className="text-lg font-bold text-gray-900 mb-4 px-6">
          Positional Breakdown
        </h3>
        <div className="border-t border-line">
          <DataTable
            columns={positionColumns}
            data={positionRows}
            emptyMessage="No positional data for these filters."
          />
        </div>
      </div>

      {/* Sample Matchups */}
      {results.sampleMatchups.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 px-6 gap-3">
            <h3 className="text-lg font-bold text-gray-900">
              Sample Matchups ({displayedMatchups.length}
              {!showAllMatchups && results.sampleMatchups.length > 10
                ? ` of ${results.sampleMatchups.length}`
                : ""}{" "}
              of {results.totalMatchups})
            </h3>
            {results.sampleMatchups.length > 10 && (
              <button
                onClick={() => setShowAllMatchups(!showAllMatchups)}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                {showAllMatchups ? "Show Less" : "Show All"}
              </button>
            )}
          </div>
          <div className="border-t border-line">
            <DataTable
              columns={matchupColumns}
              data={displayedMatchups}
              onRowClick={(row) =>
                handleMatchupClick(row.year, row.week, row.matchupId)
              }
              emptyMessage="No matchups match these filters."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsResults;
