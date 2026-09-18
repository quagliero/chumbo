import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedLeague } from "@/types/league";
import { isWeekCompleted } from "@/utils/weekUtils";
import { getRosterPointsFor, roundToTwoDecimals } from "@/utils/recordUtils";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";
import { ManagerLink } from "@/presentation/components/Links";
import { calculateWinPercentage } from "@/utils/recordUtils";

const columnHelper = createColumnHelper<ExtendedRoster>();

/** "9-4" / "9-4-1" — ties are only worth the space when there are some. */
const formatRecord = (record: {
  wins: number;
  losses: number;
  ties: number;
}) =>
  `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`;

interface ScheduleComparisonProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  getTeamName: (ownerId: string) => string;
}

const ScheduleComparison = ({
  rosters,
  matchups,
  league,
  getTeamName,
}: ScheduleComparisonProps) => {
  if (!matchups || !league) {
    return (
      <div className="text-center text-gray-500 py-8">
        Schedule data not available for this season
      </div>
    );
  }

  // Get playoff week start to filter out playoff games
  const playoffWeekStart = league.settings?.playoff_week_start || 15;

  // Sort rosters by overall record (best to worst)
  const sortedRosters = [...rosters].sort((a, b) => {
    const aWinPct =
      calculateWinPercentage(a.settings.wins, a.settings.losses, a.settings.ties);
    const bWinPct =
      calculateWinPercentage(b.settings.wins, b.settings.losses, b.settings.ties);

    if (aWinPct !== bWinPct) return bWinPct - aWinPct;

    const aPoints = roundToTwoDecimals(getRosterPointsFor(a));
    const bPoints = roundToTwoDecimals(getRosterPointsFor(b));
    return bPoints - aPoints;
  });

  // Calculate what a team's record would be if they played another team's schedule
  const calculateCrossScheduleRecord = (
    teamRoster: ExtendedRoster,
    opponentRoster: ExtendedRoster
  ) => {
    if (teamRoster.roster_id === opponentRoster.roster_id) {
      // Return actual record for same team
      return {
        wins: teamRoster.settings.wins,
        losses: teamRoster.settings.losses,
        ties: teamRoster.settings.ties,
        points: roundToTwoDecimals(getRosterPointsFor(teamRoster)),
      };
    }

    let wins = 0;
    let losses = 0;
    let ties = 0;
    let totalPoints = 0;

    // Get the opponent's schedule (regular season only)
    Object.keys(matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);

      // Skip incomplete weeks
      if (!isWeekCompleted(weekNum, league)) {
        return;
      }

      if (weekNum >= playoffWeekStart) return; // Skip playoff weeks

      const weekMatchups = matchups[weekKey];

      // Find the opponent's matchup this week
      const opponentMatchup = weekMatchups.find(
        (m) => m.roster_id === opponentRoster.roster_id
      );

      if (!opponentMatchup) return;

      // Find who the opponent played against this week (their opponent)
      const opponentOpponent = weekMatchups.find(
        (m) =>
          m.matchup_id === opponentMatchup.matchup_id &&
          m.roster_id !== opponentRoster.roster_id
      );

      if (!opponentOpponent) return;

      // If the opponent's opponent is our team, we need to handle this differently
      // This means our team played the opponent this week, so we should compare our score vs the opponent's score
      if (opponentOpponent.roster_id === teamRoster.roster_id) {
        // Get our team's score for this week
        const teamMatchup = weekMatchups.find(
          (m) => m.roster_id === teamRoster.roster_id
        );
        if (!teamMatchup) return;

        // Skip if both teams have 0 points (incomplete week)
        if (teamMatchup.points === 0 && opponentMatchup.points === 0) return;

        totalPoints = roundToTwoDecimals(totalPoints + teamMatchup.points);

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
        (m) => m.roster_id === teamRoster.roster_id
      );
      if (!teamMatchup) return;

      // Skip if both teams have 0 points (incomplete week)
      if (teamMatchup.points === 0 && opponentOpponent.points === 0) return;

      totalPoints = roundToTwoDecimals(totalPoints + teamMatchup.points);

      // Compare our team's score vs the opponent's opponent's score
      // This simulates: if Team A played Team B's schedule, how would Team A do against Team B's opponents?
      const teamScore = roundToTwoDecimals(teamMatchup.points);
      const opponentOpponentScore = roundToTwoDecimals(opponentOpponent.points);

      if (teamScore > opponentOpponentScore) {
        wins++;
      } else if (teamScore < opponentOpponentScore) {
        losses++;
      } else {
        ties++;
      }
    });

    return { wins, losses, ties, points: totalPoints };
  };

  // One column per opponent's schedule, plus the row's own team. A matrix is
  // read across and down rather than sorted, so every column is fixed.
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
    columnHelper.group({
      id: "vsSchedule",
      header: "Vs Schedule",
      meta: { headerClassName: "!bg-line font-bold", align: "center" as const },
      columns: sortedRosters.map((opponentRoster) =>
        columnHelper.display({
          id: `vs-${opponentRoster.roster_id}`,
          header: () => (
            <ManagerLink ownerId={opponentRoster.owner_id}>
              {getTeamName(opponentRoster.owner_id)}
            </ManagerLink>
          ),
          cell: ({ row }) => (
            <span className="text-xs font-medium">
              {formatRecord(
                calculateCrossScheduleRecord(row.original, opponentRoster)
              )}
            </span>
          ),
          meta: {
            kind: "record" as const,
            headerClassName: "min-w-24",
            // The diagonal — a team against its own schedule, which is just
            // its actual record.
            rowCellClassName: (roster: ExtendedRoster) =>
              roster.roster_id === opponentRoster.roster_id
                ? "bg-surface-sunk"
                : undefined,
          },
        })
      ),
    }),
  ];

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Schedule Comparison
        </h2>
        <p className="text-gray-600">
          See what each team's record would be if they played every other team's
          schedule. Each cell shows the record if the row team played the column
          team's opponents.
        </p>
      </div>

      {/* Zebra would fight the diagonal, which is the one thing the matrix
          marks out. */}
      {/* No zebra: a comparison matrix shades its diagonal and colours each
          cell by result, so the row is not the unit being read. */}
      <DataTable columns={columns} data={sortedRosters} zebra={false} />
    </div>
  );
};

export default ScheduleComparison;
