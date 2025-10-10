import { useState } from "react";
import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { getPlayerImageUrl } from "@/utils/playerImage";

export interface TopPerformance {
  playerId: string;
  playerName: string;
  points: number;
  year: number;
  week: number;
  matchup_id: number;
  opponentName: string;
  result: "W" | "L" | "T";
}

interface TopPerformancesProps {
  performances: TopPerformance[];
}

const TopPerformances = ({ performances }: TopPerformancesProps) => {
  const { number } = useFormatter();
  const [displayCount, setDisplayCount] = useState<number>(12);
  const [selectedPosition, setSelectedPosition] = useState<string>("all");

  // Filter performances by position (this would need to be enhanced with actual position data)
  const filteredPerformances = performances.filter(() => {
    if (selectedPosition === "all") return true;
    // For now, we'll just return all since we don't have position data in the performance object
    // This would need to be enhanced with actual position filtering logic
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 px-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Top All-Time Performances
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Position:</label>
          <select
            value={selectedPosition}
            onChange={(e) => {
              setSelectedPosition(e.target.value);
              setDisplayCount(12); // Reset display count when filter changes
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
          .slice(0, displayCount)
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
                    <div className="text-xs text-gray-500">points</div>
                  </div>
                </div>
              </div>

              {/* Player Info */}
              <div className="mb-3">
                <div className="flex items-center mb-2">
                  {(() => {
                    const imageUrl = getPlayerImageUrl(performance.playerId);
                    return imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`${performance.playerName} photo`}
                        className="w-8 h-8 rounded-full object-cover mr-2"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                        {performance.playerName.charAt(0).toUpperCase()}
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

      {/* Show More Button */}
      {filteredPerformances.length > displayCount && (
        <div className="text-center mt-6 px-6">
          <button
            onClick={() => setDisplayCount((prev) => prev + 12)}
            className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
          >
            Show More
          </button>
        </div>
      )}
    </div>
  );
};

export default TopPerformances;
