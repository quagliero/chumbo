import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createColumnHelper } from "@tanstack/react-table";
import { seasons } from "@/data";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getTeamName } from "@/utils/teamName";
import {
  calculateWinPercentage,
  roundToTwoDecimals,
} from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { ExtendedMatchup } from "@/types/matchup";
import { Card } from "@/presentation/components/Card";
import { DataTable } from "../Table";

type ViewMode = "byTeam" | "grid";

interface CrossScheduleRecord {
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
}

/**
 * One row of the by-team table: a team whose schedule the selected team could
 * have played, and the record they would have had playing it.
 *
 * The record is resolved into the row rather than looked up at render time so
 * that sorting can just read the column, which is what the hand-rolled sort
 * this replaced had to reimplement for each of its five fields.
 */
interface ComparisonRow {
  ownerId: string;
  teamName: string;
  /** The selected team's own row, which shows their actual record. */
  isSelectedTeam: boolean;
  record: CrossScheduleRecord;
  /** Win-percentage points better or worse than the selected team's actual. */
  recordDifference: number;
}

/** ".500", not "0.500" — the convention every fantasy site uses. */
const formatWinPercentage = (winPercentage: number) => {
  const formatted = winPercentage.toFixed(3);
  return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
};

/** A team with no games against a schedule has no comparison to show. */
const isEmptyRecord = (record: CrossScheduleRecord) =>
  record.wins === 0 && record.losses === 0 && record.ties === 0;

const differenceClass = (difference: number) =>
  difference > 0
    ? "text-green-600"
    : difference < 0
    ? "text-red-600"
    : "text-ink-muted";

const comparisonColumnHelper = createColumnHelper<ComparisonRow>();
const matrixColumnHelper =
  createColumnHelper<AllTimeScheduleComparisonStats>();

const comparisonColumns = [
  comparisonColumnHelper.accessor("teamName", {
    header: "Team",
    cell: (info) => info.getValue(),
    sortDescFirst: true,
    meta: {
      kind: "manager" as const,
      // The selected team's own row is the baseline being compared against,
      // and links to the page you are already on.
      ownerId: (row: ComparisonRow) =>
        row.isSelectedTeam ? undefined : row.ownerId,
      cellClassName: "font-medium",
    },
  }),
  comparisonColumnHelper.display({
    id: "actual",
    header: "",
    cell: ({ row }) =>
      row.original.isSelectedTeam ? (
        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
          Actual
        </span>
      ) : null,
    meta: { headerClassName: "w-0" },
  }),
  comparisonColumnHelper.accessor((row) => row.record.wins, {
    id: "wins",
    header: "W",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.accessor((row) => row.record.losses, {
    id: "losses",
    header: "L",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.accessor((row) => row.record.ties, {
    id: "ties",
    header: "T",
    cell: (info) => info.getValue(),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.accessor((row) => row.record.winPercentage, {
    id: "winPercentage",
    header: "Win %",
    cell: (info) => formatWinPercentage(info.getValue()),
    sortingFn: "basic",
    sortDescFirst: true,
    meta: { kind: "numeric" as const },
  }),
  comparisonColumnHelper.display({
    id: "vsSchedule",
    header: "Vs Schedule",
    cell: ({ row }) => {
      const { isSelectedTeam, record, recordDifference } = row.original;
      if (isSelectedTeam || isEmptyRecord(record)) {
        return <span className="text-ink-muted">—</span>;
      }

      return (
        <span className={`font-medium ${differenceClass(recordDifference)}`}>
          {recordDifference > 0 && "+"}
          {recordDifference.toFixed(2)}%
        </span>
      );
    },
    meta: { kind: "numeric" as const },
  }),
];

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
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  useAllSeasons();
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
              const teamScore = roundToTwoDecimals(teamMatchup.points);
              const opponentScore = roundToTwoDecimals(opponentMatchup.points);

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
            const teamScore = roundToTwoDecimals(teamMatchup.points);
            const opponentOpponentScore = roundToTwoDecimals(
              opponentOpponent.points
            );

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

  // Resolve each team's row once, so the table sorts by reading a column
  // rather than by reimplementing the lookup per sort field.
  const comparisonRows = useMemo((): ComparisonRow[] => {
    if (!selectedTeamStats) return [];

    return allTimeStats.flatMap((team) => {
      const isSelectedTeam = team.ownerId === selectedTeam;
      const record = isSelectedTeam
        ? team.actualRecord
        : selectedTeamStats.crossScheduleRecords[team.ownerId];

      if (!record) return [];

      return [
        {
          ownerId: team.ownerId,
          teamName: team.teamName,
          isSelectedTeam,
          record,
          // Win percentage difference in percentage points, to 2 decimal places
          recordDifference: roundToTwoDecimals(
            (record.winPercentage -
              selectedTeamStats.actualRecord.winPercentage) *
              100
          ),
        },
      ];
    });
  }, [allTimeStats, selectedTeamStats, selectedTeam]);

  // One column per team's schedule. A matrix is read across and down rather
  // than sorted, so every column is fixed.
  const matrixColumns = [
    matrixColumnHelper.accessor("teamName", {
      header: "Team",
      cell: (info) => info.getValue(),
      enableSorting: false,
      meta: {
        kind: "manager" as const,
        ownerId: (row: AllTimeScheduleComparisonStats) => row.ownerId,
        cellClassName: "font-medium",
      },
    }),
    ...allTimeStats.map((colTeam) =>
      matrixColumnHelper.display({
        id: `vs-${colTeam.ownerId}`,
        header: () => (
          <span className="break-words leading-tight">{colTeam.teamName}</span>
        ),
        cell: ({ row }) => {
          const rowTeam = row.original;
          const isSameTeam = rowTeam.ownerId === colTeam.ownerId;
          const record = isSameTeam
            ? rowTeam.actualRecord
            : rowTeam.crossScheduleRecords[colTeam.ownerId];

          if (!record) return null;

          const recordDifference = isSameTeam
            ? 0
            : roundToTwoDecimals(
                (record.winPercentage - rowTeam.actualRecord.winPercentage) *
                  100
              );

          return (
            <div className="space-y-1 text-xs">
              <div className="font-medium">
                {record.wins}-{record.losses}-{record.ties}
              </div>
              <div className="text-ink-muted">
                {formatWinPercentage(record.winPercentage)}
              </div>
              {isSameTeam ? (
                <div className="text-blue-600 font-medium">Actual</div>
              ) : isEmptyRecord(record) ? (
                <div className="text-ink-muted">—</div>
              ) : (
                <div className={`font-medium ${differenceClass(recordDifference)}`}>
                  {recordDifference > 0 && "+"}
                  {recordDifference.toFixed(2)}%
                </div>
              )}
            </div>
          );
        },
        meta: {
          kind: "record" as const,
          headerClassName: "min-w-24 max-w-32",
          // The diagonal — a team against its own schedule, which is just its
          // actual record.
          rowCellClassName: (row: AllTimeScheduleComparisonStats) =>
            row.ownerId === colTeam.ownerId ? "bg-surface-sunk" : undefined,
        },
      })
    ),
  ];

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
        <Card padding="none">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              {selectedTeamStats.teamName} - Schedule Comparison
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              What {selectedTeamStats.teamName}'s all-time record would be if
              they played each team's schedule
            </p>
          </div>

          <DataTable
            columns={comparisonColumns}
            data={comparisonRows}
            initialSorting={[{ id: "winPercentage", desc: true }]}
            getRowBackground={(row) =>
              row.original.isSelectedTeam ? "bg-blue-50" : undefined
            }
            emptyMessage="No schedules to compare against."
          />
        </Card>
      )}

      {/* Matrix Table View */}
      {viewMode === "grid" && allTimeStats.length > 0 && (
        <Card padding="none">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              All-Time Schedule Comparison Matrix
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Each cell shows what the row team's record would be if they played
              the column team's schedule
            </p>
          </div>

          {/* Zebra would fight the diagonal, which is the one thing the
              matrix marks out. */}
          <DataTable
            columns={matrixColumns}
            data={allTimeStats}
            zebra={false}
          />
        </Card>
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
