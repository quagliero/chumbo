import { useFormatter } from "use-intl";
import { useNavigate } from "react-router-dom";
import { ExtendedRoster } from "../../../types/roster";
import { BracketMatch } from "../../../types/bracket";
import { League } from "../../../types/league";
import { ExtendedUser } from "../../../types/user";
import { getUserAvatarUrl, getUserByOwnerId } from "../../../utils/userAvatar";
import managers from "../../../data/managers.json";
import { seasons } from "../../../data";

interface StandingsProps {
  standings: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  league: League | undefined;
  winnersBracket: BracketMatch[] | undefined;
  users?: ExtendedUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchups?: Record<string, any[]>; // For league record calculations
  currentYear?: number; // Current year being viewed
}

const Standings = ({
  standings,
  getTeamName,
  league,
  winnersBracket,
  users,
  matchups,
  currentYear,
}: StandingsProps) => {
  const { number } = useFormatter();
  const navigate = useNavigate();

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

  // Calculate league records for Scumbo (worst league record)
  const leagueRecords = standings.map((roster) => {
    let leagueWins = 0;
    let leagueLosses = 0;
    let leagueTies = 0;

    // Calculate league-wide performance (vs everyone each week)
    Object.keys(matchups || {}).forEach((weekKey) => {
      const weekMatchups = matchups?.[weekKey];
      if (!weekMatchups) return;

      const teamMatchup = weekMatchups.find(
        (m) => m.roster_id === roster.roster_id
      );
      if (!teamMatchup) return;

      const allScores = weekMatchups.map((m) => m.points);
      const betterScores = allScores.filter(
        (score) => score > teamMatchup.points
      ).length;
      const worseScores = allScores.filter(
        (score) => score < teamMatchup.points
      ).length;
      const sameScores =
        allScores.filter((score) => score === teamMatchup.points).length - 1; // -1 for self

      leagueWins += worseScores;
      leagueLosses += betterScores;
      leagueTies += sameScores;
    });

    return {
      roster,
      leagueWins,
      leagueLosses,
      leagueTies,
      leagueWinPct: leagueWins / (leagueWins + leagueLosses + leagueTies) || 0,
    };
  });

  // Get Scumbo (worst league record)
  const scumbo = leagueRecords.reduce((worst, current) => {
    if (current.leagueWinPct < worst.leagueWinPct) return current;
    if (current.leagueWinPct === worst.leagueWinPct) {
      // Tiebreaker: more losses
      return current.leagueLosses > worst.leagueLosses ? current : worst;
    }
    return worst;
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
                <td className="p-3">
                  <div className="flex items-center space-x-3">
                    {(() => {
                      const user = getUserByOwnerId(roster.owner_id, users);
                      const avatarUrl = getUserAvatarUrl(user);
                      const manager = managers.find(
                        (m) => m.sleeper.id === roster.owner_id
                      );
                      const managerId = manager?.id;
                      const teamName = getTeamName(roster.owner_id);

                      return (
                        <>
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={`${teamName} avatar`}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                              {teamName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {managerId ? (
                            <button
                              onClick={() => navigate(`/managers/${managerId}`)}
                              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              {teamName}
                            </button>
                          ) : (
                            <span>{teamName}</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </td>
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

      {/* Awards Grid */}
      {isSeasonComplete && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Champion */}
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-lg border-2 border-yellow-200">
            <div className="text-center">
              <div className="text-4xl mb-2">🏆</div>
              <h3 className="text-lg font-bold text-yellow-800 mb-2">
                Champion
              </h3>
              {(() => {
                const championRoster = standings.find(
                  (r) => r.roster_id === firstPlace?.w
                );
                const championManager = championRoster
                  ? managers.find(
                      (m) => m.sleeper.id === championRoster.owner_id
                    )
                  : null;
                const championName = championRoster
                  ? getTeamName(championRoster.owner_id)
                  : "TBD";

                // Calculate championship history
                const championshipHistory = () => {
                  if (!championRoster) return null;

                  const allChampionships = Object.entries(seasons)
                    .filter(([year, season]) => {
                      const yearNum = parseInt(year);
                      // Only include years up to and including the current year
                      return (
                        season?.winners_bracket &&
                        (!currentYear || yearNum <= currentYear)
                      );
                    })
                    .map(([year, season]) => {
                      const championship = season.winners_bracket.find(
                        (m) => m.p === 1
                      );
                      if (!championship) return null;

                      // Find the roster that won the championship
                      const winningRoster = season.rosters?.find(
                        (r) => r.roster_id === championship.w
                      );

                      return winningRoster
                        ? {
                            year: parseInt(year),
                            ownerId: winningRoster.owner_id,
                          }
                        : null;
                    })
                    .filter(Boolean);

                  const thisManagerChampionships = allChampionships
                    .filter(
                      (champ) => champ?.ownerId === championRoster.owner_id
                    )
                    .map((champ) => champ!.year)
                    .sort((a, b) => a - b);

                  const previousYears = thisManagerChampionships.filter(
                    (year) => year !== currentYear
                  );
                  const winCount = thisManagerChampionships.length;

                  if (winCount === 1) {
                    return "First win";
                  } else if (winCount === 2) {
                    return `Second win (${previousYears.join(", ")})`;
                  } else if (winCount === 3) {
                    return `Third win (${previousYears.join(", ")})`;
                  } else {
                    return `${winCount}th win (${previousYears.join(", ")})`;
                  }
                };

                return championManager ? (
                  <div>
                    <button
                      onClick={() =>
                        navigate(`/managers/${championManager.id}`)
                      }
                      className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                    >
                      {championName}
                    </button>
                    <div className="text-sm text-yellow-600 mt-1">
                      {championshipHistory()}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold">{championName}</span>
                    <div className="text-sm text-yellow-600 mt-1">
                      {championshipHistory()}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Scoring Crown */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-2 border-purple-200">
            <div className="text-center">
              <div className="text-4xl mb-2">👑</div>
              <h3 className="text-lg font-bold text-purple-800 mb-2">
                Scoring Crown
              </h3>
              {(() => {
                const scoringCrownManager = managers.find(
                  (m) => m.sleeper.id === topScorer.owner_id
                );
                const scoringCrownName = getTeamName(topScorer.owner_id);

                return scoringCrownManager ? (
                  <button
                    onClick={() =>
                      navigate(`/managers/${scoringCrownManager.id}`)
                    }
                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                  >
                    {scoringCrownName}
                  </button>
                ) : (
                  <span className="font-semibold">{scoringCrownName}</span>
                );
              })()}
              <div className="text-sm text-purple-600 mt-1">
                {number(
                  topScorer.settings.fpts +
                    topScorer.settings.fpts_decimal / 100,
                  { maximumFractionDigits: 2 }
                )}{" "}
                points
              </div>
            </div>
          </div>

          {/* Scumbo */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-lg border-2 border-red-200">
            <div className="text-center">
              <div className="text-4xl mb-2">💩</div>
              <h3 className="text-lg font-bold text-red-800 mb-2">Scumbo</h3>
              {(() => {
                const scumboManager = managers.find(
                  (m) => m.sleeper.id === scumbo.roster.owner_id
                );
                const scumboName = getTeamName(scumbo.roster.owner_id);

                return scumboManager ? (
                  <button
                    onClick={() => navigate(`/managers/${scumboManager.id}`)}
                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                  >
                    {scumboName}
                  </button>
                ) : (
                  <span className="font-semibold">{scumboName}</span>
                );
              })()}
              <div className="text-sm text-red-600 mt-1">
                {scumbo.leagueWins}-{scumbo.leagueLosses}
                {scumbo.leagueTies > 0 && `-${scumbo.leagueTies}`} league record
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Standings;
