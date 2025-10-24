import { useMemo, useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { seasons } from "@/data";
import { getTeamName } from "@/utils/teamName";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { calculateWinPercentage } from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { ExtendedMatchup } from "@/types/matchup";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SortIcon,
} from "../Table";

type SortField = "team" | "wins" | "losses" | "ties" | "winPercentage";
type SortDirection = "asc" | "desc";
type ViewMode = "byTeam" | "grid";

interface AllTimeScheduleComparisonStats {
  ownerId: string;
  teamName: string;
  actualRecord: {
    wins: number;
    losses: number;
    ties: number;
    winPercentage: number;
  };
  crossScheduleRecords: {
    [opponentOwnerId: string]: {
      wins: number;
      losses: number;
      ties: number;
      winPercentage: number;
    };
  };
}

const AllTimeScheduleComparison = () => {
  const { view } = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("winPercentage");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
  const allTimeStats = useMemo(() => {
    const statsMap = new Map<string, AllTimeScheduleComparisonStats>();

    // Get all unique owner IDs across all seasons
    const allOwnerIds = new Set<string>();
    Object.values(seasons).forEach((seasonData) => {
      seasonData.rosters?.forEach((roster) => {
        allOwnerIds.add(roster.owner_id);
      });
    });

    // Get active teams (teams that played in the most recent season)
    const activeOwnerIds = new Set<string>();
    const mostRecentYear = Math.max(...Object.keys(seasons).map(Number));
    const mostRecentSeason = seasons[mostRecentYear as keyof typeof seasons];
    mostRecentSeason?.rosters?.forEach((roster) => {
      activeOwnerIds.add(roster.owner_id);
    });

    // Filter owner IDs based on active teams setting
    const filteredOwnerIds = activeTeamsOnly
      ? Array.from(allOwnerIds).filter((id) => activeOwnerIds.has(id))
      : Array.from(allOwnerIds);

    // Calculate stats for each owner
    filteredOwnerIds.forEach((ownerId) => {
      const teamName = getTeamName(ownerId);
      let totalWins = 0;
      let totalLosses = 0;
      let totalTies = 0;
      const crossScheduleRecords: {
        [key: string]: {
          wins: number;
          losses: number;
          ties: number;
          winPercentage: number;
        };
      } = {};

      // Initialize cross-schedule records for all other teams
      filteredOwnerIds.forEach((opponentId) => {
        if (opponentId !== ownerId) {
          crossScheduleRecords[opponentId] = {
            wins: 0,
            losses: 0,
            ties: 0,
            winPercentage: 0,
          };
        }
      });

      // Process each season
      Object.entries(seasons).forEach(([, seasonData]) => {
        const playoffWeekStart =
          seasonData.league?.settings?.playoff_week_start || 15;

        // Find this owner's roster for this season
        const ownerRoster = seasonData.rosters?.find(
          (r) => r.owner_id === ownerId
        );
        if (!ownerRoster) return; // Skip if owner wasn't in this season

        // Add actual record from roster settings (same as ScheduleComparison)
        totalWins += ownerRoster.settings.wins;
        totalLosses += ownerRoster.settings.losses;
        totalTies += ownerRoster.settings.ties;

        // Calculate cross-schedule records using the same logic as ScheduleComparison
        filteredOwnerIds.forEach((opponentId) => {
          if (opponentId === ownerId) return;

          // Find opponent's roster for this season
          const opponentRoster = seasonData.rosters?.find(
            (r) => r.owner_id === opponentId
          );

          // If opponent wasn't in this season, skip
          if (!opponentRoster) return;

          // Use the same calculateCrossScheduleRecord logic as ScheduleComparison
          let wins = 0;
          let losses = 0;
          let ties = 0;

          // Get the opponent's schedule (regular season only)
          Object.keys(seasonData.matchups || {}).forEach((weekKey) => {
            const weekNum = parseInt(weekKey);

            // Skip incomplete weeks
            if (!isWeekCompleted(weekNum, seasonData.league)) {
              return;
            }

            if (weekNum >= playoffWeekStart) return; // Skip playoff weeks

            const weekMatchups = (seasonData.matchups?.[
              weekKey as keyof typeof seasonData.matchups
            ] || []) as ExtendedMatchup[];

            // Find the opponent's matchup this week
            const opponentMatchup = weekMatchups.find(
              (m: ExtendedMatchup) => m.roster_id === opponentRoster.roster_id
            );

            if (!opponentMatchup) return;

            // Find who the opponent played against this week (their opponent)
            const opponentOpponent = weekMatchups.find(
              (m: ExtendedMatchup) =>
                m.matchup_id === opponentMatchup.matchup_id &&
                m.roster_id !== opponentRoster.roster_id
            );

            if (!opponentOpponent) return;

            // If the opponent's opponent is our team, we need to handle this differently
            // This means our team played the opponent this week, so we should compare our score vs the opponent's score
            if (opponentOpponent.roster_id === ownerRoster.roster_id) {
              // Get our team's score for this week
              const teamMatchup = weekMatchups.find(
                (m: ExtendedMatchup) => m.roster_id === ownerRoster.roster_id
              );
              if (!teamMatchup) return;

              // Skip if both teams have 0 points (incomplete week)
              if (teamMatchup.points === 0 && opponentMatchup.points === 0)
                return;

              // Compare our team's score vs the opponent's score (direct H2H)
              const teamScore = teamMatchup.points;
              const opponentScore = opponentMatchup.points;

              if (teamScore > opponentScore) {
                wins++;
              } else if (teamScore < opponentScore) {
                losses++;
              } else {
                ties++;
              }
              return;
            }

            // Get our team's score for this week
            const teamMatchup = weekMatchups.find(
              (m: ExtendedMatchup) => m.roster_id === ownerRoster.roster_id
            );
            if (!teamMatchup) return;

            // Skip if both teams have 0 points (incomplete week)
            if (teamMatchup.points === 0 && opponentOpponent.points === 0)
              return;

            // Compare our team's score vs the opponent's opponent's score
            // This simulates: if Team A played Team B's schedule, how would Team A do against Team B's opponents?
            const teamScore = teamMatchup.points;
            const opponentOpponentScore = opponentOpponent.points;

            if (teamScore > opponentOpponentScore) {
              wins++;
            } else if (teamScore < opponentOpponentScore) {
              losses++;
            } else {
              ties++;
            }
          });

          // Add to cross-schedule records
          crossScheduleRecords[opponentId].wins += wins;
          crossScheduleRecords[opponentId].losses += losses;
          crossScheduleRecords[opponentId].ties += ties;
        });
      });

      // Calculate win percentages
      const actualWinPercentage = calculateWinPercentage(
        totalWins,
        totalLosses,
        totalTies
      );

      Object.keys(crossScheduleRecords).forEach((opponentId) => {
        const record = crossScheduleRecords[opponentId];
        record.winPercentage = calculateWinPercentage(
          record.wins,
          record.losses,
          record.ties
        );
      });

      statsMap.set(ownerId, {
        ownerId,
        teamName,
        actualRecord: {
          wins: totalWins,
          losses: totalLosses,
          ties: totalTies,
          winPercentage: actualWinPercentage,
        },
        crossScheduleRecords,
      });
    });

    return Array.from(statsMap.values()).sort(
      (a, b) => b.actualRecord.winPercentage - a.actualRecord.winPercentage
    );
  }, [activeTeamsOnly]);

  const selectedTeamStats = allTimeStats.find(
    (team) => team.ownerId === selectedTeam
  );

  // Sort the teams based on selected criteria
  const sortedTeams = useMemo(() => {
    if (!selectedTeamStats) return allTimeStats;

    return [...allTimeStats].sort((a, b) => {
      const isSelectedA = a.ownerId === selectedTeam;
      const isSelectedB = b.ownerId === selectedTeam;

      // Sort all teams by the selected field (including selected team)
      const recordA = isSelectedA
        ? a.actualRecord
        : selectedTeamStats.crossScheduleRecords[a.ownerId];
      const recordB = isSelectedB
        ? b.actualRecord
        : selectedTeamStats.crossScheduleRecords[b.ownerId];

      if (!recordA || !recordB) return 0;

      let valueA: number | string;
      let valueB: number | string;

      switch (sortField) {
        case "team":
          valueA = a.teamName;
          valueB = b.teamName;
          break;
        case "wins":
          valueA = recordA.wins;
          valueB = recordB.wins;
          break;
        case "losses":
          valueA = recordA.losses;
          valueB = recordB.losses;
          break;
        case "ties":
          valueA = recordA.ties;
          valueB = recordB.ties;
          break;
        case "winPercentage":
          valueA = recordA.winPercentage;
          valueB = recordB.winPercentage;
          break;
        default:
          return 0;
      }

      if (typeof valueA === "string" && typeof valueB === "string") {
        return sortDirection === "asc"
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);
      } else {
        return sortDirection === "asc"
          ? (valueA as number) - (valueB as number)
          : (valueB as number) - (valueA as number);
      }
    });
  }, [allTimeStats, selectedTeamStats, sortField, sortDirection, selectedTeam]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  return (
    <div className="container mx-auto space-y-6">
      {/* View Toggle */}
      <div className="bg-white rounded-lg shadow overflow-hidden p-6">
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
      </div>

      {/* Team Selection - Only for By Team View */}
      {viewMode === "byTeam" && (
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
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
        </div>
      )}

      {/* Schedule Comparison Table */}
      {selectedTeamStats && viewMode === "byTeam" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              {selectedTeamStats.teamName} - Schedule Comparison
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              What {selectedTeamStats.teamName}'s all-time record would be if
              they played each team's schedule
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell
                  className="text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("team")}
                  isSorted={sortField === "team"}
                >
                  <div className="flex items-center">
                    Team
                    {sortField === "team" && (
                      <SortIcon
                        sortDirection={sortDirection}
                        className="ml-1"
                      />
                    )}
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("wins")}
                  isSorted={sortField === "wins"}
                >
                  <div className="flex items-center justify-end">
                    W
                    {sortField === "wins" && (
                      <SortIcon
                        sortDirection={sortDirection}
                        className="ml-1"
                      />
                    )}
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("losses")}
                  isSorted={sortField === "losses"}
                >
                  <div className="flex items-center justify-end">
                    L
                    {sortField === "losses" && (
                      <SortIcon
                        sortDirection={sortDirection}
                        className="ml-1"
                      />
                    )}
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("ties")}
                  isSorted={sortField === "ties"}
                >
                  <div className="flex items-center justify-end">
                    T
                    {sortField === "ties" && (
                      <SortIcon
                        sortDirection={sortDirection}
                        className="ml-1"
                      />
                    )}
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="text-right cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("winPercentage")}
                  isSorted={sortField === "winPercentage"}
                >
                  <div className="flex items-center justify-end">
                    Win %
                    {sortField === "winPercentage" && (
                      <SortIcon
                        sortDirection={sortDirection}
                        className="ml-1"
                      />
                    )}
                  </div>
                </TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Vs Schedule
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTeams.map((team) => {
                const isSelectedTeam = team.ownerId === selectedTeam;
                const record = isSelectedTeam
                  ? team.actualRecord
                  : selectedTeamStats.crossScheduleRecords[team.ownerId];

                if (!record) return null;

                const recordDifference =
                  record.winPercentage -
                  selectedTeamStats.actualRecord.winPercentage;
                const isBetter = recordDifference > 0.001;
                const isWorse = recordDifference < -0.001;

                return (
                  <TableRow
                    key={team.ownerId}
                    className={isSelectedTeam ? "bg-blue-50" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {isSelectedTeam
                            ? team.teamName
                            : (() => {
                                const managerId = getManagerIdBySleeperOwnerId(
                                  team.ownerId
                                );
                                return managerId ? (
                                  <Link
                                    to={`/managers/${managerId}`}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    {team.teamName}
                                  </Link>
                                ) : (
                                  <span>{team.teamName}</span>
                                );
                              })()}
                        </div>
                        {isSelectedTeam && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            Actual
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{record.wins}</TableCell>
                    <TableCell className="text-right">
                      {record.losses}
                    </TableCell>
                    <TableCell className="text-right">{record.ties}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const formatted = record.winPercentage.toFixed(3);
                        // Remove leading zero if present (e.g., "0.500" -> ".500")
                        return formatted.startsWith("0.")
                          ? formatted.substring(1)
                          : formatted;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isSelectedTeam ? (
                        <span className="text-gray-500">—</span>
                      ) : record.wins === 0 &&
                        record.losses === 0 &&
                        record.ties === 0 ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        <span
                          className={`font-medium ${
                            isBetter
                              ? "text-green-600"
                              : isWorse
                              ? "text-red-600"
                              : "text-gray-600"
                          }`}
                        >
                          {isBetter && "+"}
                          {(recordDifference * 100).toFixed(1)}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Matrix Table View */}
      {viewMode === "grid" && allTimeStats.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              All-Time Schedule Comparison Matrix
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Each cell shows what the row team's record would be if they played
              the column team's schedule
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className="sticky left-0 bg-gray-50 z-10">
                  Team
                </TableHeaderCell>
                {allTimeStats.map((team) => (
                  <TableHeaderCell
                    key={team.ownerId}
                    className="text-center min-w-24 max-w-32"
                  >
                    <div className="break-words leading-tight">
                      {team.teamName}
                    </div>
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTimeStats.map((rowTeam) => (
                <TableRow key={rowTeam.ownerId}>
                  <TableCell className="sticky left-0 bg-white z-10 font-medium">
                    {(() => {
                      const managerId = getManagerIdBySleeperOwnerId(
                        rowTeam.ownerId
                      );
                      return managerId ? (
                        <Link
                          to={`/managers/${managerId}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {rowTeam.teamName}
                        </Link>
                      ) : (
                        <span>{rowTeam.teamName}</span>
                      );
                    })()}
                  </TableCell>
                  {allTimeStats.map((colTeam) => {
                    const isSameTeam = rowTeam.ownerId === colTeam.ownerId;
                    const record = isSameTeam
                      ? rowTeam.actualRecord
                      : rowTeam.crossScheduleRecords[colTeam.ownerId];

                    if (!record) return null;

                    const recordDifference = isSameTeam
                      ? 0
                      : record.winPercentage -
                        rowTeam.actualRecord.winPercentage;
                    const isBetter = recordDifference > 0.001;
                    const isWorse = recordDifference < -0.001;

                    return (
                      <TableCell
                        key={colTeam.ownerId}
                        className={`text-center text-xs ${
                          isSameTeam ? "bg-gray-100" : ""
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="font-medium">
                            {record.wins}-{record.losses}-{record.ties}
                          </div>
                          <div className="text-gray-500">
                            {(() => {
                              const formatted = record.winPercentage.toFixed(3);
                              // Remove leading zero if present (e.g., "0.500" -> ".500")
                              return formatted.startsWith("0.")
                                ? formatted.substring(1)
                                : formatted;
                            })()}
                          </div>
                          {!isSameTeam &&
                          record.wins === 0 &&
                          record.losses === 0 &&
                          record.ties === 0 ? (
                            <div className="text-xs text-gray-500">—</div>
                          ) : (
                            !isSameTeam && (
                              <div
                                className={`text-xs font-medium ${
                                  isBetter
                                    ? "text-green-600"
                                    : isWorse
                                    ? "text-red-600"
                                    : "text-gray-600"
                                }`}
                              >
                                {isBetter && "+"}
                                {(recordDifference * 100).toFixed(1)}%
                              </div>
                            )
                          )}
                          {isSameTeam && (
                            <div className="text-xs text-blue-600 font-medium">
                              Actual
                            </div>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Instructions */}
      {viewMode === "byTeam" && !selectedTeam && (
        <div className="bg-white rounded-lg shadow overflow-hidden p-6">
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
        </div>
      )}
    </div>
  );
};

export default AllTimeScheduleComparison;
