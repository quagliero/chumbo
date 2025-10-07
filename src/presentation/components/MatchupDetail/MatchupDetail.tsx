import { useFormatter } from "use-intl";
import { useNavigate } from "react-router-dom";
import { ExtendedMatchup } from "../../../types/matchup";
import { ExtendedRoster } from "../../../types/roster";
import { ExtendedUser } from "../../../types/user";
import { managers } from "../../../data";
import { getAllTimeH2HRecord } from "../../../utils/h2h";
import { getPlayerImageUrl } from "../../../utils/playerImage";
import { getUserAvatarUrl, getUserByOwnerId } from "../../../utils/userAvatar";
import {
  getRecordUpToWeek,
  getCurrentStreak,
} from "../../../utils/matchupStats";
import { getPlayerRows, getOptimalLineup } from "../../../utils/lineupAnalysis";

interface MatchupDetailProps {
  matchup: [ExtendedMatchup, ExtendedMatchup];
  rosters: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  week: number;
  year: number;
  allMatchups: Record<string, ExtendedMatchup[]>; // For H2H calculations
  users?: ExtendedUser[];
}

const MatchupDetail = ({
  matchup,
  rosters,
  getTeamName,
  week,
  year,
  allMatchups,
  users,
}: MatchupDetailProps) => {
  const { number } = useFormatter();
  const navigate = useNavigate();
  const [team1Data, team2Data] = matchup;

  // Get team info
  const team1Roster = rosters.find((r) => r.roster_id === team1Data.roster_id);
  const team2Roster = rosters.find((r) => r.roster_id === team2Data.roster_id);
  const team1Name = getTeamName(team1Roster?.owner_id || "");
  const team2Name = getTeamName(team2Roster?.owner_id || "");

  const team1Record = getRecordUpToWeek(team1Data.roster_id, allMatchups, week);
  const team2Record = getRecordUpToWeek(team2Data.roster_id, allMatchups, week);
  const h2hRecord = getAllTimeH2HRecord(
    team1Roster?.owner_id || "",
    team2Roster?.owner_id || ""
  );
  const team1Streak = getCurrentStreak(team1Data.roster_id, allMatchups, week);
  const team2Streak = getCurrentStreak(team2Data.roster_id, allMatchups, week);

  const winner =
    team1Data.points > team2Data.points
      ? team1Data.roster_id
      : team2Data.points > team1Data.points
      ? team2Data.roster_id
      : null;

  const team1Players = getPlayerRows(team1Data, year);
  const team2Players = getPlayerRows(team2Data, year);
  const team1Optimal = getOptimalLineup(team1Data, year);
  const team2Optimal = getOptimalLineup(team2Data, year);

  // Prepare team data for looping
  const teams = [
    {
      name: team1Name,
      data: team1Data,
      manager: managers.find((m) => m.sleeper.id === team1Roster?.owner_id),
      players: team1Players,
      optimal: team1Optimal,
      record: team1Record,
      streak: team1Streak,
    },
    {
      name: team2Name,
      data: team2Data,
      manager: managers.find((m) => m.sleeper.id === team2Roster?.owner_id),
      players: team2Players,
      optimal: team2Optimal,
      record: team2Record,
      streak: team2Streak,
    },
  ];

  return (
    <div className="container mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(`/history/${year}/matchups`)}
        className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
      >
        ← Back to all matchups
      </button>

      {/* Header with team info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Team cards */}
        {teams.map((team, teamIdx) => (
          <div
            key={teamIdx}
            className={`p-6 rounded-lg ${
              winner === team.data.roster_id
                ? "bg-green-50 border-2 border-green-500"
                : "bg-gray-50"
            } ${teamIdx === 0 ? "order-1" : "order-3"}`}
          >
            <div className="flex items-center space-x-3 mb-2">
              {(() => {
                const user = getUserByOwnerId(
                  team.data.roster_id === team1Data.roster_id
                    ? team1Roster?.owner_id || ""
                    : team2Roster?.owner_id || "",
                  users
                );
                const avatarUrl = getUserAvatarUrl(user);
                return avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`${team.name} avatar`}
                    className="w-10 h-10 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500">
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                );
              })()}
              <div>
                <h2 className="text-xl font-bold mb-0">{team.name}</h2>
                <h3 className="text-xs text-gray-600">{team.manager?.name}</h3>
              </div>
            </div>
            <div className="text-3xl font-bold mb-2">
              {number(team.data.points, { maximumFractionDigits: 2 })}
            </div>
            {team.optimal.pointsLeftOnBench > 0 ? (
              <div className="text-xs text-orange-600 mb-2">
                Optimal:{" "}
                {number(team.optimal.optimalTotal, {
                  maximumFractionDigits: 2,
                })}{" "}
                (+
                {number(team.optimal.pointsLeftOnBench, {
                  maximumFractionDigits: 2,
                })}
                )
              </div>
            ) : (
              <div className="text-xs text-green-600 mb-2">
                Optimal lineup selected!
              </div>
            )}
            <div className="text-sm text-gray-600 space-y-1">
              <div>
                Record: {team.record.wins}-{team.record.losses}
                {team.record.ties > 0 && `-${team.record.ties}`}
              </div>
              {team.streak.streakType && (
                <div>
                  Streak: {team.streak.streakType}
                  {team.streak.streak}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* VS and H2H */}
        <div className="order-2 text-center">
          <div className="text-xs text-gray-500 mb-1">
            {year}, Week {week}
          </div>
          <div className="text-2xl font-bold text-gray-400 mb-2">VS</div>
          <div className="text-sm text-gray-600">
            <div className="font-semibold mb-1">
              All-Time H2H (Regular Season)
            </div>
            <div>
              {teams[0].manager?.name}: {h2hRecord.team1Wins}
              {h2hRecord.team1AvgPoints > 0 && (
                <span className="text-xs text-gray-500">
                  {" "}
                  (avg:{" "}
                  {number(h2hRecord.team1AvgPoints, {
                    maximumFractionDigits: 1,
                  })}
                  )
                </span>
              )}
            </div>
            <div>
              {teams[1].manager?.name}: {h2hRecord.team2Wins}
              {h2hRecord.team2AvgPoints > 0 && (
                <span className="text-xs text-gray-500">
                  {" "}
                  (avg:{" "}
                  {number(h2hRecord.team2AvgPoints, {
                    maximumFractionDigits: 1,
                  })}
                  )
                </span>
              )}
            </div>
            {h2hRecord.ties > 0 && <div>Ties: {h2hRecord.ties}</div>}
          </div>
        </div>
      </div>

      {/* Score sheets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {teams.map((team, teamIdx) => (
          <div key={teamIdx} className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h3 className="font-bold">{team.name}</h3>
            </div>

            {/* Starters */}
            <div className="p-4">
              <h4 className="text-sm font-semibold text-gray-600 mb-2">
                STARTERS
              </h4>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left">POS</th>
                    <th className="text-left" colSpan={2}>
                      PLAYER
                    </th>
                    <th className="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {team.players.starters.map((player, idx) => (
                    <tr key={idx}>
                      <td className="py-2 font-medium">{player.position}</td>
                      <td className="py-2 w-8">
                        {player.playerId === 0 || player.playerId === "0" ? (
                          <span className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-1">
                            <span className="text-gray-400 text-xs">—</span>
                          </span>
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center mr-1">
                            <img
                              src={getPlayerImageUrl(
                                player.playerId,
                                player.position
                              )}
                              alt={player.name}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </span>
                        )}
                      </td>
                      <td className="py-2">{player.name}</td>
                      <td className="py-2 text-right font-semibold">
                        {player.playerId === 0 || player.playerId === "0"
                          ? "—"
                          : number(player.points, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2">
                  <tr className="font-bold">
                    <td colSpan={3} className="py-2">
                      TOTAL
                    </td>
                    <td className="py-2 text-right">
                      {number(team.data.points, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bench */}
            {team.players.bench.length > 0 && (
              <div className="p-4 bg-gray-50">
                <h4 className="text-sm font-semibold text-gray-600 mb-2">
                  BENCH
                </h4>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {team.players.bench.map((player, idx) => (
                      <tr key={idx} className="text-gray-500">
                        <td className="py-2 font-medium">{player.position}</td>
                        <td className="py-2 w-8">
                          <span className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center mr-1">
                            <img
                              src={getPlayerImageUrl(
                                player.playerId,
                                player.position
                              )}
                              alt={player.name}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </span>
                        </td>
                        <td className="py-2">{player.name}</td>
                        <td className="py-2 text-right">
                          {number(player.points, { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchupDetail;
