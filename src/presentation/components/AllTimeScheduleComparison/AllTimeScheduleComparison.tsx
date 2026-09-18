import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { Card } from "@/presentation/components/Card";
import {
  buildComparisonRows,
  getAllTimeScheduleComparison,
} from "./scheduleComparison";
import TeamComparisonTable from "./TeamComparisonTable";
import ScheduleMatrix from "./ScheduleMatrix";

type ViewMode = "byTeam" | "grid";

const AllTimeScheduleComparison = () => {
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  // Names no players, so it does not wait for the dictionary (A2b).
  useAllSeasons({ players: false });
  const { view } = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [activeTeamsOnly, setActiveTeamsOnly] = useState<boolean>(false);

  // Determine view mode from URL params, default to "grid" (league)
  const viewMode: ViewMode = view === "team" ? "byTeam" : "grid";

  // Update URL when view mode changes
  const setViewMode = (mode: ViewMode) => {
    const urlView = mode === "byTeam" ? "team" : "league";
    navigate(`/schedule-comparison/${urlView}`, { replace: true });
  };

  // Redirect to default view if no view parameter is provided
  useEffect(() => {
    if (!view) {
      navigate("/schedule-comparison/league", { replace: true });
    }
  }, [view, navigate]);

  // Calculate all-time schedule comparison stats using the same logic as ScheduleComparison
  const allTimeStats = useMemo(
    () => getAllTimeScheduleComparison(activeTeamsOnly),
    [activeTeamsOnly]
  );

  const selectedTeamStats = allTimeStats.find(
    (team) => team.ownerId === selectedTeam
  );

  // Resolve each team's row once, so the table sorts by reading a column
  // rather than by reimplementing the lookup per sort field.
  const comparisonRows = useMemo(
    () => buildComparisonRows(allTimeStats, selectedTeamStats, selectedTeam),
    [allTimeStats, selectedTeamStats, selectedTeam]
  );

  return (
    <div className="container mx-auto space-y-6">
      {/* View Toggle */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {viewMode === "byTeam"
              ? "Team Schedule Comparison"
              : "League Schedule Comparison"}
          </h2>

          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="activeTeamsOnly"
                checked={activeTeamsOnly}
                onChange={(e) => setActiveTeamsOnly(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label
                htmlFor="activeTeamsOnly"
                className="ml-2 text-sm text-gray-700"
              >
                Active teams only
              </label>
            </div>

            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("byTeam")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewMode === "byTeam"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                By Team
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                League
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Team Selection - Only for By Team View */}
      {viewMode === "byTeam" && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Select Team
          </h3>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Choose a team...</option>
            {allTimeStats.map((team) => (
              <option key={team.ownerId} value={team.ownerId}>
                {team.teamName}
              </option>
            ))}
          </select>
        </Card>
      )}

      {/* Schedule Comparison Table */}
      {selectedTeamStats && viewMode === "byTeam" && (
        <TeamComparisonTable
          selectedTeamStats={selectedTeamStats}
          comparisonRows={comparisonRows}
        />
      )}

      {/* Matrix Table View */}
      {viewMode === "grid" && allTimeStats.length > 0 && (
        <ScheduleMatrix allTimeStats={allTimeStats} />
      )}

      {/* Instructions */}
      {viewMode === "byTeam" && !selectedTeam && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            How it works
          </h3>
          <div className="space-y-3 text-gray-600">
            <p>
              <strong>By Team View:</strong> Select a team to see what their
              all-time record would be if they had played each other team's
              schedule. This compares their weekly scores against the opponents
              that each team actually faced, giving insight into how schedule
              difficulty affected their performance.
            </p>
            <p>
              <strong>League View:</strong> See all cross-schedule comparisons
              in a matrix format. Each cell shows what the row team's record
              would be if they played the column team's schedule.
            </p>
            <p>
              <strong>Active Teams Only:</strong> Filter to show only teams
              currently in the league (2025 participants).
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AllTimeScheduleComparison;
