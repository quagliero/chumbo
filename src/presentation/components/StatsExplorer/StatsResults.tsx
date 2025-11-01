import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { StatsResult } from "@/utils/statsExplorer";

interface StatsResultsProps {
  results: StatsResult | null;
  isLoading: boolean;
}

const StatsResults: React.FC<StatsResultsProps> = ({ results, isLoading }) => {
  const navigate = useNavigate();
  const [showAllMatchups, setShowAllMatchups] = useState(false);

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
        <div className="overflow-x-auto border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Average Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Min Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max Points
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(results.positionalBreakdown).map(
                ([position, stats]) => (
                  <tr key={position}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {position}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stats.avg.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stats.min.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stats.max.toFixed(1)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
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
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Week
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Points
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opponent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Result
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Positional Scores
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedMatchups.map((matchup) => (
                  <tr
                    key={`${matchup.year}-${matchup.week}-${matchup.matchupId}-${matchup.rosterId}`}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() =>
                      handleMatchupClick(
                        matchup.year,
                        matchup.week,
                        matchup.matchupId
                      )
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {matchup.year}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {matchup.week}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {matchup.points.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {matchup.opponentPoints.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          matchup.result === "W"
                            ? "bg-green-100 text-green-800"
                            : matchup.result === "L"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {matchup.result}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(matchup.positionalScores)
                          .filter(([, score]) => score > 0)
                          .map(([pos, score]) => (
                            <span
                              key={pos}
                              className="inline-flex px-2 py-1 text-xs bg-gray-100 rounded"
                            >
                              {pos}: {score.toFixed(1)}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsResults;
