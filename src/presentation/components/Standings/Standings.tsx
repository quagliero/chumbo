import { useFormatter } from "use-intl";
import { ExtendedRoster } from "../../../types/roster";
import { BracketMatch } from "../../../types/bracket";
import { League } from "../../../types/league";

interface StandingsProps {
  standings: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  league: League | undefined;
  winnersBracket: BracketMatch[] | undefined;
}

const Standings = ({
  standings,
  getTeamName,
  league,
  winnersBracket,
}: StandingsProps) => {
  const { number } = useFormatter();

  // Only show awards if season is complete
  const isSeasonComplete = league?.status === "complete";

  // Get playoff placements
  const firstPlace = winnersBracket?.find((m) => m.p === 1);
  const thirdPlace = winnersBracket?.find((m) => m.p === 3);

  // Get top scorer
  const topScorer = standings.reduce((max, r) => {
    const rPoints = r.settings.fpts + r.settings.fpts_decimal / 100;
    const maxPoints = max.settings.fpts + max.settings.fpts_decimal / 100;
    return rPoints > maxPoints ? r : max;
  });

  // Get bottom scorer
  const bottomScorer = standings.reduce((min, r) => {
    const rPoints = r.settings.fpts + r.settings.fpts_decimal / 100;
    const minPoints = min.settings.fpts + min.settings.fpts_decimal / 100;
    return rPoints < minPoints ? r : min;
  });

  return (
    <div className="overflow-x-auto container mx-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3">Rank</th>
            <th className="text-left p-3">Team</th>
            <th className="text-center p-3">W</th>
            <th className="text-center p-3">L</th>
            <th className="text-center p-3">T</th>
            <th className="text-center p-3">Win %</th>
            <th className="text-right p-3">Points For</th>
            <th className="text-right p-3">Points Against</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {standings.map((roster: ExtendedRoster, index: number) => {
            const winPerc =
              roster.settings.wins /
              (roster.settings.wins +
                roster.settings.losses +
                roster.settings.ties);
            const pointsFor =
              roster.settings.fpts + roster.settings.fpts_decimal / 100;
            const pointsAgainst =
              roster.settings.fpts_against +
              roster.settings.fpts_against_decimal / 100;

            const isChampion =
              isSeasonComplete && firstPlace?.w === roster.roster_id;
            const isRunnerUp =
              isSeasonComplete && firstPlace?.l === roster.roster_id;
            const isThirdPlace =
              isSeasonComplete && thirdPlace?.w === roster.roster_id;
            const isTopScorer =
              isSeasonComplete && roster.roster_id === topScorer.roster_id;
            const isBottomScorer =
              isSeasonComplete && roster.roster_id === bottomScorer.roster_id;

            return (
              <tr key={roster.roster_id} className="hover:bg-gray-50">
                <td className="p-3 font-medium">
                  {index + 1}
                  {isChampion && " 🥇"}
                  {isRunnerUp && " 🥈"}
                  {isThirdPlace && " 🥉"}
                  {isTopScorer && " 🎯"}
                  {isBottomScorer && " 💩"}
                </td>
                <td className="p-3">{getTeamName(roster.owner_id)}</td>
                <td className="text-center p-3">{roster.settings.wins}</td>
                <td className="text-center p-3">{roster.settings.losses}</td>
                <td className="text-center p-3">{roster.settings.ties}</td>
                <td className="text-center p-3">
                  {number(winPerc, { maximumFractionDigits: 3 })}
                </td>
                <td className="text-right p-3">
                  {number(pointsFor, { maximumFractionDigits: 2 })}
                </td>
                <td className="text-right p-3">
                  {number(pointsAgainst, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Standings;
