import { ExtendedRoster } from "../../../types/roster";
import { ExtendedMatchup } from "../../../types/matchup";
import { League } from "../../../types/league";

interface ScheduleComparisonProps {
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: League | undefined;
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
      a.settings.wins / (a.settings.wins + a.settings.losses + a.settings.ties);
    const bWinPct =
      b.settings.wins / (b.settings.wins + b.settings.losses + b.settings.ties);

    if (aWinPct !== bWinPct) return bWinPct - aWinPct;

    const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
    const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
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
        points:
          teamRoster.settings.fpts + teamRoster.settings.fpts_decimal / 100,
      };
    }

    let wins = 0;
    let losses = 0;
    let ties = 0;
    let totalPoints = 0;

    // Get the opponent's schedule (regular season only)
    Object.keys(matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);
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

      // Skip if the opponent's opponent is the same as our team (would be comparing against ourselves)
      if (opponentOpponent.roster_id === teamRoster.roster_id) return;

      // Get our team's score for this week
      const teamMatchup = weekMatchups.find(
        (m) => m.roster_id === teamRoster.roster_id
      );
      if (!teamMatchup) {
        // If our team didn't play this week (bye week), skip this week
        return;
      }

      totalPoints += teamMatchup.points;

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

    return { wins, losses, ties, points: totalPoints };
  };

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Schedule Comparison
        </h2>
        <p className="text-gray-600">
          See what each team's record would be if they played every other team's
          schedule. Each cell shows the record if the row team played the column
          team's opponents. Ties are highlighted in orange.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b border-gray-300 bg-gray-50 sticky left-0 z-10">
                Team
              </th>
              {sortedRosters.map((roster) => (
                <th
                  key={roster.roster_id}
                  className="text-center p-2 border-b border-gray-300 bg-gray-50 min-w-24"
                >
                  {getTeamName(roster.owner_id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRosters.map((teamRoster) => (
              <tr key={teamRoster.roster_id}>
                <td className="text-left p-2 border-b border-gray-200 bg-gray-50 sticky left-0 z-10 font-medium">
                  {getTeamName(teamRoster.owner_id)}
                </td>
                {sortedRosters.map((opponentRoster) => {
                  const crossRecord = calculateCrossScheduleRecord(
                    teamRoster,
                    opponentRoster
                  );
                  const isSameTeam =
                    teamRoster.roster_id === opponentRoster.roster_id;

                  return (
                    <td
                      key={opponentRoster.roster_id}
                      className={`text-center p-2 border-b border-gray-200 ${
                        isSameTeam ? "bg-gray-100" : ""
                      }`}
                    >
                      <div className="text-xs">
                        <div className={`font-medium`}>
                          {crossRecord.wins}-{crossRecord.losses}
                          {crossRecord.ties > 0 && `-${crossRecord.ties}`}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduleComparison;
