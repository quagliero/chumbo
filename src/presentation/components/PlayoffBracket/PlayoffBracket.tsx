import { useFormatter } from "use-intl";
import { useNavigate } from "react-router-dom";
import { BracketMatch } from "../../../types/bracket";
import { ExtendedRoster } from "../../../types/roster";
import { ExtendedMatchup } from "../../../types/matchup";
import { ExtendedLeague } from "../../../types/league";
import { ExtendedUser } from "../../../types/user";
import { getUserAvatarUrl, getUserByOwnerId } from "../../../utils/userAvatar";

interface PlayoffBracketProps {
  winnersBracket: BracketMatch[];
  rosters: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  getPlayoffSeed: (rosterId: number) => number | null;
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  year: number;
  users?: ExtendedUser[];
}

const PlayoffBracket = ({
  winnersBracket,
  rosters,
  getTeamName,
  getPlayoffSeed,
  matchups,
  league,
  year,
  users,
}: PlayoffBracketProps) => {
  const { number } = useFormatter();
  const navigate = useNavigate();

  const roundData = Array.from(new Set(winnersBracket.map((m) => m.r)))
    .sort((a, b) => a - b)
    .filter((round) => {
      // Only include rounds that have matches (excluding championship/3rd place)
      const roundMatches = winnersBracket.filter((m) => m.r === round && !m.p);
      return roundMatches.length > 0;
    });

  return (
    <div className="space-y-8 container mx-auto overflow-x-auto">
      {/* Playoff Bracket */}
      <div>
        <h2 className="text-xl font-bold mb-6">Playoff Bracket</h2>
        <div
          className="grid gap-8 pb-4"
          style={{
            gridTemplateColumns: `repeat(${roundData.length + 1}, 1fr)`,
          }}
        >
          {roundData.map((round) => {
            return (
              <div key={round} className="flex flex-col justify-around">
                <div className="text-center font-semibold text-sm text-gray-600 mb-4">
                  Round {round}
                </div>
              </div>
            );
          })}
          <div className="flex flex-col justify-center">
            <div className="text-center font-semibold text-sm text-gray-600 mb-4">
              Championship
            </div>
          </div>
        </div>
        <div
          className="grid gap-8 pb-4"
          style={{
            gridTemplateColumns: `repeat(${roundData.length + 1}, 1fr)`,
          }}
        >
          {roundData.map((round) => {
            const roundMatches = winnersBracket
              .filter((m) => m.r === round && !m.p)
              .sort((a, b) => a.m - b.m);

            // Calculate playoff week (last regular season week + round)
            const playoffWeekStart = league?.settings?.playoff_week_start || 15;
            const weekNumber = playoffWeekStart - 1 + round;

            // Find teams with byes (only for round 1)
            const byeTeams: number[] = [];
            if (round === 1) {
              // Get all teams in round 1
              const round1Teams = new Set<number>();
              roundMatches.forEach((m) => {
                round1Teams.add(m.t1);
                round1Teams.add(m.t2);
              });

              // Get teams in round 2 that aren't in round 1
              const round2Matches = winnersBracket.filter(
                (m) => m.r === 2 && !m.p
              );
              round2Matches.forEach((m) => {
                if (!round1Teams.has(m.t1)) byeTeams.push(m.t1);
                if (!round1Teams.has(m.t2)) byeTeams.push(m.t2);
              });
            }

            return (
              <div key={round} className="flex flex-col justify-around">
                <div className="flex flex-col gap-8">
                  {/* Bye matchups (only for round 1) */}
                  {byeTeams.map((teamId) => {
                    const roster = rosters.find((r) => r.roster_id === teamId);
                    const teamName = getTeamName(roster?.owner_id || "");
                    const teamSeed = getPlayoffSeed(teamId);
                    const user = getUserByOwnerId(
                      roster?.owner_id || "",
                      users
                    );
                    const avatarUrl = getUserAvatarUrl(user);

                    return (
                      <div
                        key={`bye-${teamId}`}
                        className="border rounded bg-white shadow-sm"
                      >
                        <div className="px-3 py-2 border-b text-sm bg-blue-50 font-semibold">
                          <div className="flex items-center space-x-2">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={`${teamName} avatar`}
                                className="w-6 h-6 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                                {teamName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span>
                              {teamSeed && (
                                <span className="text-gray-500 mr-1">
                                  {teamSeed}.
                                </span>
                              )}
                              {teamName}
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-2 text-sm text-gray-500 italic">
                          Bye
                        </div>
                      </div>
                    );
                  })}
                  {roundMatches.map((match) => {
                    const team1Roster = rosters.find(
                      (r) => r.roster_id === match.t1
                    );
                    const team2Roster = rosters.find(
                      (r) => r.roster_id === match.t2
                    );
                    const team1Name = getTeamName(team1Roster?.owner_id || "");
                    const team2Name = getTeamName(team2Roster?.owner_id || "");
                    const team1Seed = getPlayoffSeed(match.t1);
                    const team2Seed = getPlayoffSeed(match.t2);
                    const team1User = getUserByOwnerId(
                      team1Roster?.owner_id || "",
                      users
                    );
                    const team2User = getUserByOwnerId(
                      team2Roster?.owner_id || "",
                      users
                    );
                    const team1AvatarUrl = getUserAvatarUrl(team1User);
                    const team2AvatarUrl = getUserAvatarUrl(team2User);

                    // Get scores from matchup data
                    const weekMatchups =
                      matchups?.[
                        weekNumber.toString() as keyof typeof matchups
                      ];
                    const team1Matchup = weekMatchups?.find(
                      (m: ExtendedMatchup) => m.roster_id === match.t1
                    );
                    const team2Matchup = weekMatchups?.find(
                      (m: ExtendedMatchup) => m.roster_id === match.t2
                    );
                    const team1Score = team1Matchup?.points;
                    const team2Score = team2Matchup?.points;

                    return (
                      <div
                        key={match.m}
                        className="border rounded bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => {
                          if (team1Matchup?.matchup_id) {
                            navigate(
                              `/history/${year}/matchups/${weekNumber}/${team1Matchup.matchup_id}`
                            );
                          }
                        }}
                      >
                        <div
                          className={`px-3 py-2 border-b text-sm flex justify-between items-center ${
                            match.w === match.t1
                              ? "bg-green-50 font-semibold"
                              : "bg-white"
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            {team1AvatarUrl ? (
                              <img
                                src={team1AvatarUrl}
                                alt={`${team1Name} avatar`}
                                className="w-6 h-6 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                                {team1Name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span>
                              {team1Seed && (
                                <span className="text-gray-500 mr-1">
                                  {team1Seed}.
                                </span>
                              )}
                              {team1Name}
                            </span>
                          </div>
                          {team1Score !== undefined && (
                            <span className="ml-2">
                              {number(team1Score, {
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          )}
                        </div>
                        <div
                          className={`px-3 py-2 text-sm flex justify-between items-center ${
                            match.w === match.t2
                              ? "bg-green-50 font-semibold"
                              : "bg-white"
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            {team2AvatarUrl ? (
                              <img
                                src={team2AvatarUrl}
                                alt={`${team2Name} avatar`}
                                className="w-6 h-6 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                                {team2Name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span>
                              {team2Seed && (
                                <span className="text-gray-500 mr-1">
                                  {team2Seed}.
                                </span>
                              )}
                              {team2Name}
                            </span>
                          </div>
                          {team2Score !== undefined && (
                            <span className="ml-2">
                              {number(team2Score, {
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Championship Game */}
          {(() => {
            const championship = winnersBracket.find((m) => m.p === 1);
            if (!championship) return null;

            const team1Roster = rosters.find(
              (r) => r.roster_id === championship.t1
            );
            const team2Roster = rosters.find(
              (r) => r.roster_id === championship.t2
            );
            const team1Name = getTeamName(team1Roster?.owner_id || "");
            const team2Name = getTeamName(team2Roster?.owner_id || "");
            const team1Seed = getPlayoffSeed(championship.t1);
            const team2Seed = getPlayoffSeed(championship.t2);
            const team1User = getUserByOwnerId(
              team1Roster?.owner_id || "",
              users
            );
            const team2User = getUserByOwnerId(
              team2Roster?.owner_id || "",
              users
            );
            const team1AvatarUrl = getUserAvatarUrl(team1User);
            const team2AvatarUrl = getUserAvatarUrl(team2User);

            // Get scores from matchup data
            const playoffWeekStart = league?.settings?.playoff_week_start || 15;
            const weekNumber = playoffWeekStart - 1 + championship.r;
            const weekMatchups =
              matchups?.[weekNumber.toString() as keyof typeof matchups];
            const team1Matchup = weekMatchups?.find(
              (m: ExtendedMatchup) => m.roster_id === championship.t1
            );
            const team2Matchup = weekMatchups?.find(
              (m: ExtendedMatchup) => m.roster_id === championship.t2
            );
            const team1Score = team1Matchup?.points;
            const team2Score = team2Matchup?.points;

            return (
              <div className="flex flex-col justify-center">
                <div
                  className="border rounded bg-white shadow-md cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => {
                    if (team1Matchup?.matchup_id) {
                      navigate(
                        `/history/${year}/matchups/${weekNumber}/${team1Matchup.matchup_id}`
                      );
                    }
                  }}
                >
                  <div
                    className={`px-3 py-2 border-b text-sm flex justify-between items-center ${
                      championship.w === championship.t1
                        ? "bg-yellow-50 font-bold"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {team1AvatarUrl ? (
                        <img
                          src={team1AvatarUrl}
                          alt={`${team1Name} avatar`}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                          {team1Name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>
                        {team1Seed && (
                          <span className="text-gray-500 mr-1">
                            {team1Seed}.
                          </span>
                        )}
                        {team1Name}
                        {championship.w === championship.t1 && " 🏆"}
                      </span>
                    </div>
                    {team1Score !== undefined && (
                      <span className="ml-2">
                        {number(team1Score, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                  <div
                    className={`px-3 py-2 text-sm flex justify-between items-center ${
                      championship.w === championship.t2
                        ? "bg-yellow-50 font-bold"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {team2AvatarUrl ? (
                        <img
                          src={team2AvatarUrl}
                          alt={`${team2Name} avatar`}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                          {team2Name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>
                        {team2Seed && (
                          <span className="text-gray-500 mr-1">
                            {team2Seed}.
                          </span>
                        )}
                        {team2Name}
                        {championship.w === championship.t2 && " 🏆"}
                      </span>
                    </div>
                    {team2Score !== undefined && (
                      <span className="ml-2">
                        {number(team2Score, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 3rd Place Game */}
        {(() => {
          const thirdPlace = winnersBracket.find((m) => m.p === 3);
          if (!thirdPlace) return null;

          const team1Roster = rosters.find(
            (r) => r.roster_id === thirdPlace.t1
          );
          const team2Roster = rosters.find(
            (r) => r.roster_id === thirdPlace.t2
          );
          const team1Name = getTeamName(team1Roster?.owner_id || "");
          const team2Name = getTeamName(team2Roster?.owner_id || "");
          const team1Seed = getPlayoffSeed(thirdPlace.t1);
          const team2Seed = getPlayoffSeed(thirdPlace.t2);
          const team1User = getUserByOwnerId(
            team1Roster?.owner_id || "",
            users
          );
          const team2User = getUserByOwnerId(
            team2Roster?.owner_id || "",
            users
          );
          const team1AvatarUrl = getUserAvatarUrl(team1User);
          const team2AvatarUrl = getUserAvatarUrl(team2User);

          // Get scores from matchup data
          const playoffWeekStart = league?.settings?.playoff_week_start || 15;
          const weekNumber = playoffWeekStart - 1 + thirdPlace.r;
          const weekMatchups =
            matchups?.[weekNumber.toString() as keyof typeof matchups];
          const team1Matchup = weekMatchups?.find(
            (m: ExtendedMatchup) => m.roster_id === thirdPlace.t1
          );
          const team2Matchup = weekMatchups?.find(
            (m: ExtendedMatchup) => m.roster_id === thirdPlace.t2
          );
          const team1Score = team1Matchup?.points;
          const team2Score = team2Matchup?.points;

          return (
            <div
              className="grid gap-8 mt-8 whitespace-nowrap"
              style={{
                gridTemplateColumns: `repeat(${roundData.length + 1}, 1fr)`,
              }}
            >
              <div style={{ gridColumn: `span ${roundData.length}` }} />
              <div className="col-span-1">
                <div className="text-center font-semibold text-sm text-gray-600 mb-4">
                  3rd Place
                </div>
                <div
                  className="border rounded bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    if (team1Matchup?.matchup_id) {
                      navigate(
                        `/history/${year}/matchups/${weekNumber}/${team1Matchup.matchup_id}`
                      );
                    }
                  }}
                >
                  <div
                    className={`px-3 py-2 border-b text-sm flex justify-between items-center ${
                      thirdPlace.w === thirdPlace.t1
                        ? "bg-orange-50 font-semibold"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {team1AvatarUrl ? (
                        <img
                          src={team1AvatarUrl}
                          alt={`${team1Name} avatar`}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                          {team1Name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>
                        {team1Seed && (
                          <span className="text-gray-500 mr-1">
                            {team1Seed}.
                          </span>
                        )}
                        {team1Name}
                        {thirdPlace.w === thirdPlace.t1 && " 🥉"}
                      </span>
                    </div>
                    {team1Score !== undefined && (
                      <span className="ml-2">
                        {number(team1Score, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                  <div
                    className={`px-3 py-2 text-sm flex justify-between items-center ${
                      thirdPlace.w === thirdPlace.t2
                        ? "bg-orange-50 font-semibold"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {team2AvatarUrl ? (
                        <img
                          src={team2AvatarUrl}
                          alt={`${team2Name} avatar`}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                          {team2Name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>
                        {team2Seed && (
                          <span className="text-gray-500 mr-1">
                            {team2Seed}.
                          </span>
                        )}
                        {team2Name}
                        {thirdPlace.w === thirdPlace.t2 && " 🥉"}
                      </span>
                    </div>
                    {team2Score !== undefined && (
                      <span className="ml-2">
                        {number(team2Score, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default PlayoffBracket;
