import { useState } from "react";
import { useFormatter } from "use-intl";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedLeague } from "@/types/league";
import {
  calculateWeeklyLeagueRecord,
  determineMatchupResult,
  roundToTwoDecimals, calculateWinPercentage } from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { CURRENT_YEAR } from "@/domain/constants";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";

const columnHelper = createColumnHelper<ExtendedRoster>();

/** "9-4" / "9-4-1" — ties are only worth the space when there are some. */
const formatRecord = (record: {
  wins: number;
  losses: number;
  ties: number;
}) =>
  `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`;

interface BreakdownProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  getTeamName: (ownerId: string) => string;
  currentYear?: number;
}

const Breakdown = ({
  rosters,
  matchups,
  league,
  getTeamName,
  currentYear,
}: BreakdownProps) => {
  const { number } = useFormatter();
  const [showLuck, setShowLuck] = useState(false);

  if (!matchups || !league) {
    return (
      <div className="text-center text-gray-500 py-8">
        Matchup data not available for this season
      </div>
    );
  }

  // Get playoff week start to filter out playoff games
  const playoffWeekStart = league.settings?.playoff_week_start || 15;

  // Get all regular season weeks (only completed ones for current year)
  const regularSeasonWeeks = Object.keys(matchups)
    .map(Number)
    .filter(
      (week) =>
        week < playoffWeekStart &&
        (currentYear === CURRENT_YEAR ? isWeekCompleted(week, league) : true)
    )
    .sort((a, b) => a - b);

  // Calculate weekly record for a team
  const getWeeklyRecord = (roster: ExtendedRoster, week: number) => {
    return calculateWeeklyLeagueRecord(roster, week, matchups || {});
  };

  // Calculate season totals for a team
  const getSeasonTotals = (roster: ExtendedRoster) => {
    let totalWins = 0;
    let totalLosses = 0;
    let totalTies = 0;
    let totalPoints = 0;

    regularSeasonWeeks.forEach((week) => {
      const weekRecord = getWeeklyRecord(roster, week);
      totalWins += weekRecord.wins;
      totalLosses += weekRecord.losses;
      totalTies += weekRecord.ties;
      totalPoints = roundToTwoDecimals(totalPoints + weekRecord.points);
    });

    return { totalWins, totalLosses, totalTies, totalPoints };
  };

  // Get actual result for a team in a specific week (W/L/T)
  const getActualResult = (roster: ExtendedRoster, week: number) => {
    const weekMatchups = matchups[week.toString()];
    if (!weekMatchups) return null;

    const teamMatchup = weekMatchups.find(
      (m) => m.roster_id === roster.roster_id
    );
    if (!teamMatchup) return null;

    // Find the opponent in this matchup
    const opponent = weekMatchups.find(
      (m) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );
    if (!opponent) return null;

    return determineMatchupResult(
      roundToTwoDecimals(teamMatchup.points),
      roundToTwoDecimals(opponent.points)
    );
  };

  // Calculate luck for a week (positive = lucky, negative = unlucky)
  const getLuckValue = (roster: ExtendedRoster, week: number) => {
    const weekRecord = getWeeklyRecord(roster, week);
    const actualResult = getActualResult(roster, week);

    if (!actualResult) return 0;

    const totalGames = weekRecord.wins + weekRecord.losses + weekRecord.ties;
    if (totalGames === 0) return 0;

    // A tie with somebody's score that week counts half, as everywhere else.
    const winPercentage = calculateWinPercentage(
      weekRecord.wins,
      weekRecord.losses,
      weekRecord.ties
    );

    // Only show luck when result is opposite of expectation
    if (actualResult === "W") {
      // Won the game - only lucky if had losing record vs league (win% < 0.5)
      if (winPercentage < 0.5) {
        return 0.5 - winPercentage; // Positive = lucky (green)
      }
      return 0; // Expected result, no luck
    } else if (actualResult === "L") {
      // Lost the game - only unlucky if had winning record vs league (win% > 0.5)
      if (winPercentage > 0.5) {
        return -(winPercentage - 0.5); // Negative = unlucky (red)
      }
      return 0; // Expected result, no luck
    } else {
      // Tie - neutral luck
      return 0;
    }
  };

  // Get luck color style based on luck value
  const getLuckStyle = (luckValue: number) => {
    if (luckValue === 0) return {};

    const intensity = Math.abs(luckValue) * 2; // Scale to 0-1
    const opacity = Math.min(0.8, 0.3 + intensity * 0.5); // Base opacity + intensity

    if (luckValue > 0) {
      // Lucky (green) - won when had low win %
      return { backgroundColor: `rgba(34, 197, 94, ${opacity})` }; // green-500 with opacity
    } else {
      // Unlucky (red) - lost when had high win %
      return { backgroundColor: `rgba(239, 68, 68, ${opacity})` }; // red-500 with opacity
    }
  };

  // Sort rosters by season total (best to worst)
  const sortedRosters = [...rosters].sort((a, b) => {
    const aSeasonTotals = getSeasonTotals(a);
    const bSeasonTotals = getSeasonTotals(b);

    const aWinPct =
      aSeasonTotals.totalWins /
      (aSeasonTotals.totalWins +
        aSeasonTotals.totalLosses +
        aSeasonTotals.totalTies);
    const bWinPct =
      bSeasonTotals.totalWins /
      (bSeasonTotals.totalWins +
        bSeasonTotals.totalLosses +
        bSeasonTotals.totalTies);

    if (aWinPct !== bWinPct) return bWinPct - aWinPct;

    return bSeasonTotals.totalPoints - aSeasonTotals.totalPoints;
  });

  // One column per completed regular-season week, plus the season total. The
  // rows are pre-sorted by season record, and a week column holds a record
  // rather than a number, so nothing here sorts.
  const columns = [
    columnHelper.display({
      id: "team",
      header: "Team",
      cell: ({ row }) => getTeamName(row.original.owner_id),
      meta: {
        kind: "manager" as const,
        ownerId: (roster: ExtendedRoster) => roster.owner_id,
        cellClassName: "font-medium",
      },
    }),
    ...regularSeasonWeeks.map((week) =>
      columnHelper.display({
        id: `week-${week}`,
        header: `W${week}`,
        cell: ({ row }) => {
          const weekRecord = getWeeklyRecord(row.original, week);
          return (
            <div className="text-xs">
              <div className="font-medium">{formatRecord(weekRecord)}</div>
              <div className="text-ink-muted">
                {number(weekRecord.points, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          );
        },
        meta: {
          kind: "record" as const,
          headerClassName: "min-w-20",
          // The luck shade is computed from how far the week's result diverged
          // from the record against the league, so it cannot be a class.
          rowCellStyle: (roster: ExtendedRoster) =>
            showLuck ? getLuckStyle(getLuckValue(roster, week)) : undefined,
        },
      })
    ),
    columnHelper.display({
      id: "seasonTotal",
      header: "Season Total",
      cell: ({ row }) => {
        const seasonTotals = getSeasonTotals(row.original);
        return (
          <div className="text-xs">
            <div>
              {seasonTotals.totalWins}-{seasonTotals.totalLosses}
              {seasonTotals.totalTies > 0 && `-${seasonTotals.totalTies}`}
            </div>
            <div className="text-ink-muted">
              {number(seasonTotals.totalPoints, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        );
      },
      meta: {
        kind: "record" as const,
        headerClassName: "min-w-24 font-bold",
        cellClassName: "bg-surface-sunk font-bold",
      },
    }),
  ];

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-gray-800">Weekly Breakdown</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              Schedule Luck
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={showLuck}
                onChange={(e) => setShowLuck(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`flex w-11 h-6 rounded-full transition-colors duration-200 ${
                  showLuck ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 overflow-hidden ${
                    showLuck ? "translate-x-5 ml-0.5" : "translate-x-0.5"
                  } mt-0.5 `}
                ></div>
              </div>
            </div>
          </label>
        </div>
        <p className="text-gray-600">
          See how each team performed against the league each week. Each cell
          shows wins-losses-ties against all other teams that week.
        </p>
      </div>

      {/* Zebra would shift the luck shading row by row, and the shading is the
          whole point of the toggle. */}
      {/* No zebra: the Schedule Luck toggle heat-maps every week cell, so
          striping underneath fights the colour that carries the meaning. */}
      <DataTable columns={columns} data={sortedRosters} zebra={false} />

      {showLuck && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
          <p className="text-sm text-gray-600">
            <span className="text-green-600 font-medium">Green</span> = Lucky
            wins (won despite having a losing record against the league),
            <span className="text-red-600 font-medium"> Red</span> = Unlucky
            losses (lost despite having a winning record against the league).
          </p>
        </div>
      )}
    </div>
  );
};

export default Breakdown;
