import { useFormatter } from "use-intl";
import { ExtendedRoster } from "../../../types/roster";
import { ExtendedMatchup } from "../../../types/matchup";
import { League } from "../../../types/league";

interface BreakdownProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: League | undefined;
  getTeamName: (ownerId: string) => string;
}

const Breakdown = ({
  rosters,
  matchups,
  league,
  getTeamName,
}: BreakdownProps) => {
  const { number } = useFormatter();

  if (!matchups || !league) {
    return (
      <div className="text-center text-gray-500 py-8">
        Matchup data not available for this season
      </div>
    );
  }

  // Get playoff week start to filter out playoff games
  const playoffWeekStart = league.settings?.playoff_week_start || 15;

  // Get all regular season weeks
  const regularSeasonWeeks = Object.keys(matchups)
    .map(Number)
    .filter((week) => week < playoffWeekStart)
    .sort((a, b) => a - b);

  // Calculate weekly record for a team
  const getWeeklyRecord = (roster: ExtendedRoster, week: number) => {
    const weekMatchups = matchups[week.toString()];
    if (!weekMatchups) return { wins: 0, losses: 0, ties: 0, points: 0 };

    const teamMatchup = weekMatchups.find(
      (m) => m.roster_id === roster.roster_id
    );
    if (!teamMatchup) return { wins: 0, losses: 0, ties: 0, points: 0 };

    const teamPoints = teamMatchup.points;
    let wins = 0;
    let losses = 0;
    let ties = 0;

    // Compare against all other teams this week
    weekMatchups.forEach((otherMatchup) => {
      if (otherMatchup.roster_id === roster.roster_id) return;

      if (teamPoints > otherMatchup.points) {
        wins++;
      } else if (teamPoints < otherMatchup.points) {
        losses++;
      } else {
        ties++;
      }
    });

    return { wins, losses, ties, points: teamPoints };
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
      totalPoints += weekRecord.points;
    });

    return { totalWins, totalLosses, totalTies, totalPoints };
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

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Weekly Breakdown
        </h2>
        <p className="text-gray-600">
          See how each team performed against the league each week. Each cell
          shows wins-losses-ties against all other teams that week.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b border-gray-300 bg-gray-50 sticky left-0 z-10">
                Team
              </th>
              {regularSeasonWeeks.map((week) => (
                <th
                  key={week}
                  className="text-center p-2 border-b border-gray-300 bg-gray-50 min-w-20"
                >
                  W{week}
                </th>
              ))}
              <th className="text-center p-2 border-b border-gray-300 bg-gray-50 min-w-24 font-bold">
                Season Total
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRosters.map((roster) => {
              const seasonTotals = getSeasonTotals(roster);

              return (
                <tr key={roster.roster_id}>
                  <td className="text-left p-2 border-b border-gray-200 bg-gray-50 sticky left-0 z-10 font-medium">
                    {getTeamName(roster.owner_id)}
                  </td>
                  {regularSeasonWeeks.map((week) => {
                    const weekRecord = getWeeklyRecord(roster, week);

                    return (
                      <td
                        key={week}
                        className="text-center p-2 border-b border-gray-200"
                      >
                        <div className="text-xs">
                          <div className="font-medium">
                            {weekRecord.wins}-{weekRecord.losses}
                            {weekRecord.ties > 0 && `-${weekRecord.ties}`}
                          </div>
                          <div className="text-gray-500">
                            {number(weekRecord.points, {
                              maximumFractionDigits: 1,
                            })}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center p-2 border-b border-gray-200 bg-gray-100 font-bold">
                    <div className="text-xs">
                      <div>
                        {seasonTotals.totalWins}-{seasonTotals.totalLosses}
                        {seasonTotals.totalTies > 0 &&
                          `-${seasonTotals.totalTies}`}
                      </div>
                      <div className="text-gray-600">
                        {number(seasonTotals.totalPoints, {
                          maximumFractionDigits: 1,
                        })}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Breakdown;
