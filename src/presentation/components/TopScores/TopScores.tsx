import { useMemo, useState, useEffect } from "react";
import { useParams, NavLink } from "react-router-dom";
import { seasons } from "@/data";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { scrollableRowClasses } from "@/presentation/components/ScrollableTabs/ScrollableTabs";
import { getTopScores } from "./rankings";
import {
  MatchTotal,
  PlayerScore,
  ScoreMode,
  SortOrder,
  TopScore,
} from "./types";
import TeamScoreCard from "./TeamScoreCard";
import MatchTotalCard from "./MatchTotalCard";
import PlayerScoreCard from "./PlayerScoreCard";

const TopScores = () => {
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  useAllSeasons();
  const { subTab } = useParams<{ subTab: string }>();
  const [displayCount, setDisplayCount] = useState<number>(20);
  const [sortOrder, setSortOrder] = useState<SortOrder>("high-to-low");
  const [selectedSeason, setSelectedSeason] = useState<string>("all-time");
  const [selectedPosition, setSelectedPosition] = useState<string>("all");
  const [filterStartedOnly, setFilterStartedOnly] = useState<boolean | null>(
    null
  );

  const scoreMode = (subTab as ScoreMode) || "team-score";

  const topScores = useMemo(
    () =>
      getTopScores({
        scoreMode,
        sortOrder,
        selectedSeason,
        selectedPosition,
        filterStartedOnly,
      }),
    [scoreMode, sortOrder, selectedSeason, selectedPosition, filterStartedOnly]
  );

  const handleLoadMore = () => {
    setDisplayCount((prev) => prev + 20);
  };

  const handleSortOrderChange = (newSortOrder: SortOrder) => {
    setSortOrder(newSortOrder);
    setDisplayCount(20); // Reset to 20 when changing sort order
  };

  // Reset display count when mode changes
  useEffect(() => {
    setDisplayCount(20);
  }, [scoreMode]);

  // Reset filters when switching away from player-score mode
  useEffect(() => {
    if (scoreMode !== "player-score") {
      setSelectedPosition("all");
      setFilterStartedOnly(null);
    }
  }, [scoreMode]);

  return (
    <div className="container mx-auto">
      {/* Mode Selector and Sort Options */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className={`${scrollableRowClasses} gap-2`}>
            <NavLink
              to="/top-scores/team-score"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive || (!subTab && scoreMode === "team-score")
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`
              }
            >
              Team Score
            </NavLink>
            <NavLink
              to="/top-scores/match-total"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`
              }
            >
              Match Total
            </NavLink>
            <NavLink
              to="/top-scores/player-score"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`
              }
            >
              Player Score
            </NavLink>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {scoreMode === "player-score" && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    Position:
                  </label>
                  <select
                    value={selectedPosition}
                    onChange={(e) => {
                      setSelectedPosition(e.target.value);
                      setDisplayCount(20);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Positions</option>
                    <option value="QB">QB</option>
                    <option value="RB">RB</option>
                    <option value="WR">WR</option>
                    <option value="TE">TE</option>
                    <option value="K">K</option>
                    <option value="DEF">DEF</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterStartedOnly === true}
                      onChange={(e) => {
                        setFilterStartedOnly(e.target.checked ? true : null);
                        setDisplayCount(20);
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Started Only
                    </span>
                  </label>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Season:
              </label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all-time">All-Time</option>
                {Object.keys(seasons)
                  .sort((a, b) => parseInt(b) - parseInt(a))
                  .map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                Sort by:
              </label>
              <select
                value={sortOrder}
                onChange={(e) =>
                  handleSortOrderChange(e.target.value as SortOrder)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="high-to-low">High to Low</option>
                <option value="low-to-high">Low to High</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {scoreMode === "team-score" &&
          (topScores as TopScore[])
            .slice(0, displayCount)
            .map((score, index) => (
              <TeamScoreCard
                key={`${score.year}-${score.week}-${score.owner_id}-${index}`}
                score={score}
                index={index}
              />
            ))}
        {scoreMode === "match-total" &&
          (topScores as MatchTotal[])
            .slice(0, displayCount)
            .map((match, index) => (
              <MatchTotalCard
                key={`${match.year}-${match.week}-${match.matchup_id}-${index}`}
                match={match}
                index={index}
              />
            ))}
        {scoreMode === "player-score" &&
          (topScores as PlayerScore[])
            .slice(0, displayCount)
            .map((player, index) => (
              <PlayerScoreCard
                key={`${player.year}-${player.week}-${player.player_id}-${index}`}
                player={player}
                index={index}
              />
            ))}
      </div>

      {/* Load More Button */}
      {topScores.length > displayCount && (
        <div className="text-center mt-8">
          <button
            onClick={handleLoadMore}
            className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {topScores.length === 0 && (
        <div className="text-center py-8 text-gray-500">No scores found</div>
      )}
    </div>
  );
};

export default TopScores;
