import { useState, useMemo } from "react";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { ExtendedLeague } from "@/types/league";
import { calculatePlayoffOdds } from "@/utils/playoffOdds";
import ScenarioPlanner from "./ScenarioPlanner";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";
import { mergeScheduledMatchups } from "@/utils/scheduleUtils";
import { ManagerLink } from "@/presentation/components/Links";

interface UserPick {
  week: number;
  matchupId: number;
  winner: number;
  team1Score?: number;
  team2Score?: number;
}

interface UserScenario {
  picks: UserPick[];
}

interface PlayoffOddsProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  schedule: Record<string, ScheduledMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  getTeamName: (ownerId: string) => string;
}

/** A row of the simulation. `calculatePlayoffOdds` does not export its type. */
type PlayoffOddsRow = ReturnType<typeof calculatePlayoffOdds>[number];

const POSITIONS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Positions 1-6 make the playoffs, so those columns are marked out. */
const IS_PLAYOFF_POSITION = (position: number) => position <= 6;

const columnHelper = createColumnHelper<PlayoffOddsRow>();

const compareRecords = (
  teamA: { wins: number; losses: number; ties: number },
  teamB: { wins: number; losses: number; ties: number }
) => {
  if (teamA.wins !== teamB.wins) {
    return teamA.wins - teamB.wins;
  }
  if (teamA.losses !== teamB.losses) {
    return teamB.losses - teamA.losses;
  }
  if (teamA.ties !== teamB.ties) {
    return teamA.ties - teamB.ties;
  }
  return 0;
};

const getPlayoffColor = (percentage: number) => {
  if (percentage >= 80) return "text-green-600 font-semibold";
  if (percentage >= 60) return "text-green-500";
  if (percentage >= 40) return "text-yellow-600";
  if (percentage >= 20) return "text-orange-500";
  return "text-red-500";
};

/** Solid bands by playoff odds. Opaque, because the pinned column inherits it. */
const getRowColor = (playoffOdds: number) => {
  if (playoffOdds >= 50) return "bg-green-100";
  if (playoffOdds >= 20) return "bg-yellow-100";
  return "bg-white";
};

const getRowBorder = (index: number) => {
  // Thick border above 7th team (playoff cutoff)
  if (index === 6) return "!border-t-4 !border-gray-600";
  // Thin border above 3rd team (bye week cutoff)
  if (index === 2) return "!border-t-2 !border-gray-400";
  return "";
};

const PlayoffOdds = ({
  rosters,
  matchups,
  schedule,
  league,
  getTeamName,
}: PlayoffOddsProps) => {
  const [userScenario, setUserScenario] = useState<UserScenario | undefined>(
    undefined
  );

  // Matchup files only exist for weeks that have been played, but the
  // simulation needs the games still to come. Shared with the remaining
  // strength of schedule calculation (H10).
  const matchupsWithSchedule = useMemo(
    () => mergeScheduledMatchups(matchups, schedule),
    [matchups, schedule]
  );

  // Calculate playoff odds
  const playoffOddsData = useMemo(() => {
    if (!matchupsWithSchedule || !league) return [];

    const seasonData = {
      matchups: matchupsWithSchedule,
      rosters,
      league,
    };

    return calculatePlayoffOdds(seasonData, userScenario);
  }, [matchupsWithSchedule, league, rosters, userScenario]);

  // Show loading or no data states
  if (!matchups || !league) {
    return (
      <div className="text-center text-gray-500 py-8">
        Playoff odds data not available for this season
      </div>
    );
  }

  if (playoffOddsData.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No remaining regular season games to simulate
      </div>
    );
  }

  /**
   * The team name lives on the roster, not on the simulation row, so name
   * comparisons have to go back through `rosters` — including as the final
   * tie-break, which is what keeps the order stable between renders when the
   * Monte Carlo produces identical odds.
   */
  const compareTeamNames = (a: PlayoffOddsRow, b: PlayoffOddsRow) => {
    const teamA = rosters.find((r) => r.roster_id === a.rosterId);
    const teamB = rosters.find((r) => r.roster_id === b.rosterId);
    if (!teamA || !teamB) return 0;
    return getTeamName(teamA.owner_id).localeCompare(
      getTeamName(teamB.owner_id)
    );
  };

  const columns = [
    // Every sortable column is an `accessor`, not a `display`: tanstack gates
    // `getCanSort()` on a column having an accessor function, so a `display`
    // column silently ignores even an explicit `sortingFn`. The accessors here
    // exist to unlock sorting; the comparison itself is the `sortingFn`.
    columnHelper.accessor(
      (row) => {
        const team = rosters.find((r) => r.roster_id === row.rosterId);
        return team ? getTeamName(team.owner_id) : "";
      },
      {
        id: "team",
        header: "Team",
        // Not `kind: "manager"`: the link is the name only. Wrapping the whole
        // cell would turn the points line under it blue too.
        cell: ({ row }) => {
          const team = rosters.find(
            (r) => r.roster_id === row.original.rosterId
          );
          if (!team) return null;

          return (
            <>
              <div className="font-medium">
                <ManagerLink
                  ownerId={team.owner_id}
                  fallbackClassName="text-ink"
                >
                  {getTeamName(team.owner_id)}
                </ManagerLink>
              </div>
              <div className="text-xs text-ink-muted">
                PF: {row.original.pointsFor.toFixed(1)} | PA:{" "}
                {row.original.pointsAgainst.toFixed(1)}
              </div>
            </>
          );
        },
        enableSorting: true,
        sortDescFirst: false,
        sortingFn: (rowA, rowB) =>
          compareTeamNames(rowA.original, rowB.original),
      }
    ),
    columnHelper.accessor((row) => row.wins, {
      id: "record",
      header: "Record",
      cell: ({ row }) =>
        `${row.original.wins}-${row.original.losses}${
          row.original.ties > 0 ? `-${row.original.ties}` : ""
        }`,
      enableSorting: true,
      sortDescFirst: true,
      sortingFn: (rowA, rowB) => {
        const comparison = compareRecords(rowA.original, rowB.original);
        return comparison !== 0
          ? comparison
          : rowA.original.pointsFor - rowB.original.pointsFor;
      },
      meta: {
        kind: "record" as const,
        headerClassName: "min-w-20 border-r border-line",
        cellClassName: "border-r border-line",
      },
    }),
    ...POSITIONS.map((position) =>
      columnHelper.accessor((row) => row.positionOdds[position], {
        id: `position-${position}`,
        header: String(position),
        cell: ({ row }) => `${row.original.positionOdds[position].toFixed(1)}%`,
        enableSorting: true,
        sortDescFirst: true,
        sortingFn: (rowA, rowB) =>
          rowA.original.positionOdds[position] -
          rowB.original.positionOdds[position],
        meta: {
          kind: "numeric" as const,
          align: "center" as const,
          headerClassName: IS_PLAYOFF_POSITION(position)
            ? "min-w-16 !bg-blue-50 font-semibold"
            : "min-w-16",
        },
      })
    ),
    columnHelper.accessor((row) => row.playoffOdds, {
      id: "playoffs",
      header: "Playoffs",
      cell: ({ row }) => `${row.original.playoffOdds.toFixed(2)}%`,
      enableSorting: true,
      sortDescFirst: true,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original;
        const b = rowB.original;
        // Two runs of the same simulation differ in the last decimal place, so
        // odds within a ten-thousandth of a point count as a draw and fall
        // through to wins, then points, then the name.
        const playoffOddsDiff = a.playoffOdds - b.playoffOdds;
        if (Math.abs(playoffOddsDiff) >= 0.0001) return playoffOddsDiff;
        if (a.wins !== b.wins) return a.wins - b.wins;
        if (a.pointsFor !== b.pointsFor) return a.pointsFor - b.pointsFor;
        return compareTeamNames(a, b);
      },
      meta: {
        kind: "numeric" as const,
        align: "center" as const,
        headerClassName:
          "min-w-20 !bg-green-50 font-semibold border-l border-line",
        cellClassName: "font-semibold border-l border-line",
        rowCellClassName: (row: PlayoffOddsRow) =>
          getPlayoffColor(row.playoffOdds),
      },
    }),
  ];

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Playoff Odds</h2>
        <p className="text-gray-600">
          Monte Carlo simulation (10,000 iterations) showing each team's
          probability of finishing in each position. Playoff odds = sum of
          positions 1-6.
        </p>
        <div className="flex flex-wrap gap-6 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-700">High Playoff Odds (≥50%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span className="text-gray-700">Medium Playoff Odds (20-49%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
            <span className="text-gray-700">Low Playoff Odds (&lt;20%)</span>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={playoffOddsData}
        initialSorting={[{ id: "playoffs", desc: true }]}
        // The odds bands already colour every row; zebra on top reads as noise.
        zebra={false}
        getRowBackground={(row) => getRowColor(row.original.playoffOdds)}
        getRowClassName={(_row, index) => getRowBorder(index)}
      />

      {/* Interactive Scenario Planner */}
      <ScenarioPlanner
        rosters={rosters}
        matchups={matchupsWithSchedule}
        league={league}
        getTeamName={getTeamName}
        onScenarioChange={setUserScenario}
      />
    </div>
  );
};

export default PlayoffOdds;
