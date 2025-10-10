import { useFormatter } from "use-intl";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedUser } from "@/types/user";
import { getRecordUpToWeek } from "@/utils/matchupStats";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";

interface MatchupsProps {
  weekMatchups: ExtendedMatchup[][];
  availableWeeks: number[];
  selectedWeek: number;
  onWeekChange: (week: number) => void;
  rosters: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  year: number;
  allMatchups: Record<string, ExtendedMatchup[]>; // For record calculations
  users?: ExtendedUser[];
  league?: { settings?: { playoff_week_start?: number } }; // For playoff week detection
  winnersBracket?: Array<{ t1: number; t2: number; r: number; p?: number }>; // For playoff match classification
}

const Matchups = ({
  weekMatchups,
  availableWeeks,
  selectedWeek,
  onWeekChange,
  rosters,
  getTeamName,
  year,
  allMatchups,
  users,
  league,
  winnersBracket,
}: MatchupsProps) => {
  const { number } = useFormatter();

  // Check if current week is a playoff week
  const playoffWeekStart = getPlayoffWeekStart({ league });
  const isPlayoffWeek = selectedWeek >= playoffWeekStart;

  // Classify matchups for playoff weeks
  const { playoffMatchups, consolationMatchups } = useMemo(() => {
    if (!isPlayoffWeek || !winnersBracket) {
      return { playoffMatchups: weekMatchups, consolationMatchups: [] };
    }

    const playoff: ExtendedMatchup[][] = [];
    const consolation: ExtendedMatchup[][] = [];

    weekMatchups.forEach((matchup) => {
      const [team1, team2] = matchup;
      if (!team1 || !team2) return;

      // Check if either team is in a meaningful bracket match
      const bracketMatch = winnersBracket.find(
        (bm) =>
          (bm.t1 === team1.roster_id || bm.t2 === team1.roster_id) &&
          bm.r === selectedWeek - playoffWeekStart + 1
      );

      if (bracketMatch) {
        // Check if it's a meaningful game (elimination or championship)
        const isMeaningfulGame = !bracketMatch.p || bracketMatch.p === 1;
        if (isMeaningfulGame) {
          playoff.push(matchup);
        } else {
          consolation.push(matchup);
        }
      } else {
        // Not in any bracket match - treat as consolation
        consolation.push(matchup);
      }
    });

    return { playoffMatchups: playoff, consolationMatchups: consolation };
  }, [
    weekMatchups,
    isPlayoffWeek,
    winnersBracket,
    selectedWeek,
    playoffWeekStart,
  ]);

  return (
    <div className="space-y-4 container mx-auto">
      {/* Week Selector */}
      <div className="flex flex-wrap gap-2">
        {availableWeeks.map((week) => {
          const isWeekPlayoff = week >= playoffWeekStart;
          return (
            <button
              key={week}
              className={`px-3 py-1 rounded text-sm font-medium ${
                selectedWeek === week
                  ? isWeekPlayoff
                    ? "bg-purple-800 text-white"
                    : "bg-blue-800 text-white"
                  : isWeekPlayoff
                  ? "bg-purple-100 text-purple-800 hover:bg-purple-200"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
              onClick={() => onWeekChange(week)}
            >
              Week {week}
            </button>
          );
        })}
      </div>

      {/* Matchups Display */}
      <div className="space-y-6">
        {/* Playoff Matches Section */}
        {isPlayoffWeek && playoffMatchups.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-3 h-3 bg-purple-600 rounded-full mr-2"></span>
              Playoff Matches
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playoffMatchups.map((matchup, index) => {
                const [team1, team2] = matchup;
                if (!team1 || !team2) return null;

                const team1Name = getTeamName(
                  rosters.find((r) => r.roster_id === team1.roster_id)
                    ?.owner_id || ""
                );
                const team2Name = getTeamName(
                  rosters.find((r) => r.roster_id === team2.roster_id)
                    ?.owner_id || ""
                );

                // Calculate records up to and including this week
                const team1Record = getRecordUpToWeek(
                  team1.roster_id,
                  allMatchups,
                  selectedWeek + 1
                );
                const team2Record = getRecordUpToWeek(
                  team2.roster_id,
                  allMatchups,
                  selectedWeek + 1
                );

                const winner =
                  team1.points > team2.points
                    ? team1.roster_id
                    : team2.points > team1.points
                    ? team2.roster_id
                    : null;

                return (
                  <Link
                    key={`playoff-${index}`}
                    to={`/history/${year}/matchups/${selectedWeek}/${team1.matchup_id}`}
                    className="border rounded-lg p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow block border-purple-200 overflow-hidden"
                  >
                    <div className="space-y-2">
                      <div
                        className={`flex justify-between items-center p-2 rounded ${
                          winner === team1.roster_id ? "bg-green-50" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {(() => {
                            const team1OwnerId =
                              rosters.find(
                                (r) => r.roster_id === team1.roster_id
                              )?.owner_id || "";
                            const user = getUserByOwnerId(team1OwnerId, users);
                            const avatarUrl = getUserAvatarUrl(user);
                            return avatarUrl ? (
                              <img
                                src={avatarUrl}
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
                            );
                          })()}
                          <div className="font-medium">
                            <div>{team1Name}</div>
                            <div className="text-xs text-gray-500">
                              ({team1Record.wins}-{team1Record.losses}
                              {team1Record.ties > 0 && `-${team1Record.ties}`})
                            </div>
                          </div>
                        </div>
                        <span className="text-lg font-bold">
                          {number(team1.points, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div
                        className={`flex justify-between items-center p-2 rounded ${
                          winner === team2.roster_id ? "bg-green-50" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {(() => {
                            const team2OwnerId =
                              rosters.find(
                                (r) => r.roster_id === team2.roster_id
                              )?.owner_id || "";
                            const user = getUserByOwnerId(team2OwnerId, users);
                            const avatarUrl = getUserAvatarUrl(user);
                            return avatarUrl ? (
                              <img
                                src={avatarUrl}
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
                            );
                          })()}
                          <div className="font-medium">
                            <div>{team2Name}</div>
                            <div className="text-xs text-gray-500">
                              ({team2Record.wins}-{team2Record.losses}
                              {team2Record.ties > 0 && `-${team2Record.ties}`})
                            </div>
                          </div>
                        </div>
                        <span className="text-lg font-bold">
                          {number(team2.points, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Consolation Matches Section */}
        {isPlayoffWeek && consolationMatchups.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
              <span className="w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
              Consolation Matches
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {consolationMatchups.map((matchup, index) => {
                const [team1, team2] = matchup;
                if (!team1 || !team2) return null;

                const team1Name = getTeamName(
                  rosters.find((r) => r.roster_id === team1.roster_id)
                    ?.owner_id || ""
                );
                const team2Name = getTeamName(
                  rosters.find((r) => r.roster_id === team2.roster_id)
                    ?.owner_id || ""
                );

                // Calculate records up to and including this week
                const team1Record = getRecordUpToWeek(
                  team1.roster_id,
                  allMatchups,
                  selectedWeek + 1
                );
                const team2Record = getRecordUpToWeek(
                  team2.roster_id,
                  allMatchups,
                  selectedWeek + 1
                );

                const winner =
                  team1.points > team2.points
                    ? team1.roster_id
                    : team2.points > team1.points
                    ? team2.roster_id
                    : null;

                return (
                  <Link
                    key={`consolation-${index}`}
                    to={`/history/${year}/matchups/${selectedWeek}/${team1.matchup_id}`}
                    className="border rounded-lg p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow block border-gray-200 opacity-75 overflow-hidden"
                  >
                    <div className="space-y-2">
                      <div
                        className={`flex justify-between items-center p-2 rounded ${
                          winner === team1.roster_id ? "bg-green-50" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {(() => {
                            const team1OwnerId =
                              rosters.find(
                                (r) => r.roster_id === team1.roster_id
                              )?.owner_id || "";
                            const user = getUserByOwnerId(team1OwnerId, users);
                            const avatarUrl = getUserAvatarUrl(user);
                            return avatarUrl ? (
                              <img
                                src={avatarUrl}
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
                            );
                          })()}
                          <div className="font-medium">
                            <div>{team1Name}</div>
                            <div className="text-xs text-gray-500">
                              ({team1Record.wins}-{team1Record.losses}
                              {team1Record.ties > 0 && `-${team1Record.ties}`})
                            </div>
                          </div>
                        </div>
                        <span className="text-lg font-bold">
                          {number(team1.points, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div
                        className={`flex justify-between items-center p-2 rounded ${
                          winner === team2.roster_id ? "bg-green-50" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {(() => {
                            const team2OwnerId =
                              rosters.find(
                                (r) => r.roster_id === team2.roster_id
                              )?.owner_id || "";
                            const user = getUserByOwnerId(team2OwnerId, users);
                            const avatarUrl = getUserAvatarUrl(user);
                            return avatarUrl ? (
                              <img
                                src={avatarUrl}
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
                            );
                          })()}
                          <div className="font-medium">
                            <div>{team2Name}</div>
                            <div className="text-xs text-gray-500">
                              ({team2Record.wins}-{team2Record.losses}
                              {team2Record.ties > 0 && `-${team2Record.ties}`})
                            </div>
                          </div>
                        </div>
                        <span className="text-lg font-bold">
                          {number(team2.points, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Regular Season Matches */}
        {!isPlayoffWeek && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weekMatchups.map((matchup, index) => {
              const [team1, team2] = matchup;
              if (!team1 || !team2) return null;

              const team1Name = getTeamName(
                rosters.find((r) => r.roster_id === team1.roster_id)
                  ?.owner_id || ""
              );
              const team2Name = getTeamName(
                rosters.find((r) => r.roster_id === team2.roster_id)
                  ?.owner_id || ""
              );

              // Calculate records up to and including this week
              const team1Record = getRecordUpToWeek(
                team1.roster_id,
                allMatchups,
                selectedWeek + 1
              );
              const team2Record = getRecordUpToWeek(
                team2.roster_id,
                allMatchups,
                selectedWeek + 1
              );

              const winner =
                team1.points > team2.points
                  ? team1.roster_id
                  : team2.points > team1.points
                  ? team2.roster_id
                  : null;

              return (
                <Link
                  key={index}
                  to={`/history/${year}/matchups/${selectedWeek}/${team1.matchup_id}`}
                  className="border rounded-lg p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow block overflow-hidden"
                >
                  <div className="space-y-2">
                    <div
                      className={`flex justify-between items-center p-2 rounded ${
                        winner === team1.roster_id ? "bg-green-50" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {(() => {
                          const team1OwnerId =
                            rosters.find((r) => r.roster_id === team1.roster_id)
                              ?.owner_id || "";
                          const user = getUserByOwnerId(team1OwnerId, users);
                          const avatarUrl = getUserAvatarUrl(user);
                          return avatarUrl ? (
                            <img
                              src={avatarUrl}
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
                          );
                        })()}
                        <div className="font-medium">
                          <div>{team1Name}</div>
                          <div className="text-xs text-gray-500">
                            ({team1Record.wins}-{team1Record.losses}
                            {team1Record.ties > 0 && `-${team1Record.ties}`})
                          </div>
                        </div>
                      </div>
                      <span className="text-lg font-bold">
                        {number(team1.points, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div
                      className={`flex justify-between items-center p-2 rounded ${
                        winner === team2.roster_id ? "bg-green-50" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {(() => {
                          const team2OwnerId =
                            rosters.find((r) => r.roster_id === team2.roster_id)
                              ?.owner_id || "";
                          const user = getUserByOwnerId(team2OwnerId, users);
                          const avatarUrl = getUserAvatarUrl(user);
                          return avatarUrl ? (
                            <img
                              src={avatarUrl}
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
                          );
                        })()}
                        <div className="font-medium">
                          <div>{team2Name}</div>
                          <div className="text-xs text-gray-500">
                            ({team2Record.wins}-{team2Record.losses}
                            {team2Record.ties > 0 && `-${team2Record.ties}`})
                          </div>
                        </div>
                      </div>
                      <span className="text-lg font-bold">
                        {number(team2.points, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Matchups;
