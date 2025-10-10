import { useFormatter } from "use-intl";
import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  getManagerStats,
  DataMode,
  TopPerformance,
  SeasonStats,
  ManagerStats,
  H2HRecord,
} from "@/utils/managerStats";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../components/Table";
import {
  ManagerStatsCard,
  H2HTable,
  AllStarLineup,
  MostDraftedPlayers,
  MostCappedPlayers,
  TopPerformances,
} from "@/presentation/components/ManagerDetail";
import type {
  ManagerStats,
  H2HRecordWithOpponent,
  TopPerformance,
} from "@/presentation/components/ManagerDetail";

const ManagerDetail = () => {
  const { managerId, tab, section } = useParams<{
    managerId: string;
    tab?: string;
    section?: string;
  }>();
  const navigate = useNavigate();
  const { number } = useFormatter();
  const [dataMode, setDataMode] = useState<DataMode>("regular");

  // Get current tab from URL params, default to 'summary'
  const currentTab = tab || "summary";

  // Get current player section from URL params, default to 'allstars'
  const selectedPlayerSection = section || "allstars";

  const managerStats = useMemo((): ManagerStats | null => {
    if (!managerId) return null;
    return getManagerStats(managerId, dataMode) as ManagerStats;
  }, [managerId, dataMode]);

  // Filter performances by position
  const filteredPerformances = useMemo((): TopPerformance[] => {
    if (!managerStats) return [];

    const performances: TopPerformance[] =
      (managerStats as ManagerStats).topPerformances?.map(
        (performance: TopPerformance) => ({
          playerId: performance.playerId,
          playerName: performance.playerName,
          points: performance.points,
          year: performance.year,
          week: performance.week,
          matchup_id: performance.matchup_id,
          opponentName: performance.opponentName,
          result: performance.result,
        })
      ) || [];

    return performances;
  }, [managerStats]);

  // Prepare H2H records for the component
  const h2hRecords: H2HRecordWithOpponent[] = useMemo(() => {
    if (!managerStats) return [];
    return Object.entries((managerStats as ManagerStats).h2hRecords || {}).map(
      ([opponentId, record]: [string, H2HRecord]) => ({
        opponentId,
        opponentName: record.managerName || "Unknown",
        record: record,
      })
    );
  }, [managerStats]);

  // Redirect to summary tab if no tab is specified
  if (!tab && managerId) {
    return <Navigate to={`/managers/${managerId}/summary`} replace />;
  }

  // Redirect to all-stars section if on players tab but no section specified
  if (currentTab === "players" && !section && managerId) {
    return <Navigate to={`/managers/${managerId}/players/allstars`} replace />;
  }

  if (!managerStats) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600">
            Manager not found
          </h1>
          <button
            onClick={() => navigate("/managers")}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{managerStats.managerName}</h1>
          <p className="text-xl text-gray-600">{managerStats.teamName}</p>
          <button
            onClick={() => navigate("/managers")}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Data Mode:</span>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="regular">Regular Season</option>
              <option value="playoffs">Playoffs Only</option>
              <option value="combined">Regular + Playoffs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <Link
            to={`/managers/${managerId}/summary`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "summary"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Summary
          </Link>
          <Link
            to={`/managers/${managerId}/seasons`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "seasons"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Seasons
          </Link>
          <Link
            to={`/managers/${managerId}/h2h`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "h2h"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            H2H
          </Link>
          <Link
            to={`/managers/${managerId}/players/allstars`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "players"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Players
          </Link>
        </nav>
      </div>

      {/* Player Section Filter Buttons */}
      {currentTab === "players" && (
        <div className=" bg-white">
          <div className="">
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/managers/${managerId}/players/allstars`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "allstars"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All Stars
              </Link>
              <Link
                to={`/managers/${managerId}/players/drafted`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "drafted"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Most Drafted
              </Link>
              <Link
                to={`/managers/${managerId}/players/capped`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "capped"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Most Capped
              </Link>
              <Link
                to={`/managers/${managerId}/players/performances`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "performances"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Top Performances
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {currentTab === "summary" && managerStats && (
        <ManagerStatsCard managerStats={managerStats} />
      )}

      {currentTab === "seasons" && (
        <>
          {/* Season Breakdown */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="text-2xl font-bold p-6">Season Breakdown</h2>
            <Table className="border-t border-neutral-200">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Year</TableHeaderCell>
                  <TableHeaderCell>Record</TableHeaderCell>
                  <TableHeaderCell>Standing / Points</TableHeaderCell>
                  <TableHeaderCell>Points For</TableHeaderCell>
                  <TableHeaderCell>Points Against</TableHeaderCell>
                  <TableHeaderCell>Result</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managerStats.seasonStats.map((season) => {
                  const winPercentage =
                    (season.wins /
                      (season.wins + season.losses + season.ties)) *
                    100;
                  return (
                    <TableRow
                      key={season.year}
                      onClick={() =>
                        navigate(`/history/${season.year}/standings`)
                      }
                    >
                      <TableCell className="font-medium">
                        {season.year}
                      </TableCell>
                      <TableCell>
                        {season.wins}-{season.losses}
                        {season.ties > 0 && `-${season.ties}`}
                        <div className="text-sm text-gray-500">
                          {number(winPercentage, {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              season.finalStanding === 1
                                ? "bg-yellow-100 text-yellow-800"
                                : season.finalStanding <= 4
                                ? "bg-green-100 text-green-800"
                                : season.finalStanding <= 8
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                            title="Regular season finish"
                          >
                            #{season.finalStanding}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              (season as SeasonStats).pointsStanding === 1
                                ? "bg-yellow-100 text-yellow-800"
                                : (season as SeasonStats).pointsStanding <= 4
                                ? "bg-green-100 text-green-800"
                                : (season as SeasonStats).pointsStanding <= 8
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                            title="Points scored rank"
                          >
                            #{(season as SeasonStats).pointsStanding || "?"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {number(season.pointsFor, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        {number(season.pointsAgainst, {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(season as SeasonStats).madePlayoffs && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              Playoffs
                            </span>
                          )}
                          {(season as SeasonStats).championshipResult ===
                            "champion" && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                              🏆 Champion
                            </span>
                          )}
                          {(season as SeasonStats).championshipResult ===
                            "runner-up" && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                              Finals
                            </span>
                          )}
                          {season.scoringCrown && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                              👑 Scoring Crown
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {currentTab === "h2h" && managerStats && (
        <H2HTable
          h2hRecords={h2hRecords}
          managerId={(managerStats as ManagerStats).managerId}
        />
      )}

      {currentTab === "players" && managerStats && (
        <div className="bg-white rounded-lg shadow overflow-hidden py-4">
          {/* All-Star Lineup */}
          {selectedPlayerSection === "allstars" && (
            <AllStarLineup
              allStarLineup={(managerStats as ManagerStats).allStarLineup || []}
            />
          )}

          {/* Most Drafted Players */}
          {selectedPlayerSection === "drafted" && (
            <MostDraftedPlayers
              mostDraftedPlayers={
                (managerStats as ManagerStats).mostDraftedPlayers || []
              }
            />
          )}

          {/* Most Capped Players */}
          {selectedPlayerSection === "capped" && (
            <MostCappedPlayers
              mostCappedPlayers={
                (managerStats as ManagerStats).mostCappedPlayers || []
              }
            />
          )}

          {/* Top Performances */}
          {selectedPlayerSection === "performances" && (
            <TopPerformances performances={filteredPerformances} />
          )}
        </div>
      )}
    </div>
  );
};

export default ManagerDetail;
