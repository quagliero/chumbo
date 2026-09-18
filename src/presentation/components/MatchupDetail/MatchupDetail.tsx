import { useFormatter } from "use-intl";
import { Link } from "react-router-dom";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedUser } from "@/types/user";
import { managers, seasons } from "@/data";
import { getH2HRecordForSeason } from "@/utils/h2h";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import { getRecordUpToWeek, getCurrentStreak } from "@/utils/matchupStats";
import { getPlayerRows, getOptimalLineup } from "@/utils/lineupAnalysis";
import { Breadcrumbs } from "@/presentation/components/Breadcrumbs";
import { NarrativeNotes } from "@/presentation/components/Narrative";
import { MatchupSeeAlso } from "@/presentation/components/SeeAlso";
import { ShareButton } from "@/presentation/components/ShareButton";
import { isWeekCompleted } from "@/utils/weekUtils";
import { interimManager } from "@/utils/interimManagers";
import { avatarDataUri } from "./shareAvatar";
import { StatLine } from "./StatLine";
import { useGameday } from "@/hooks/useGameday";
import { getManagerAccent } from "@/domain/managerColors";

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
  // L1: the real box scores, loaded beside the page rather than before it.
  const gameday = useGameday(year, week);
  const [team1Data, team2Data] = matchup;

  // Helper function to get player nickname from roster metadata
  const getPlayerNickname = (
    playerId: string | number,
    roster: ExtendedRoster | undefined
  ): string | null => {
    if (!roster?.metadata || !playerId) return null;
    const nicknameKey = `p_nick_${playerId}`;
    const nickname = roster.metadata[nicknameKey];
    return nickname && nickname.trim() !== "" ? nickname : null;
  };

  // Get team info
  const team1Roster = rosters.find((r) => r.roster_id === team1Data.roster_id);
  const team2Roster = rosters.find((r) => r.roster_id === team2Data.roster_id);
  const team1Name = getTeamName(team1Roster?.owner_id || "");
  const team2Name = getTeamName(team2Roster?.owner_id || "");

  const team1Record = getRecordUpToWeek(team1Data.roster_id, allMatchups, week);
  const team2Record = getRecordUpToWeek(team2Data.roster_id, allMatchups, week);
  // THIS SEASON's series, not the all-time one.
  //
  // This box called `getAllTimeH2HRecord`, which walks every year of `seasons`
  // — but matchups are loaded per season on demand (A2a), so on this page it
  // only ever saw the season being viewed, plus whichever others the visitor
  // happened to have opened first. The heading said "All-Time" and the number
  // changed depending on where you had been. E2's rail carries the real
  // all-time series (from the precomputed file, which does not need the
  // archive), so this box now says the season it can actually see.
  const h2hRecord = getH2HRecordForSeason(
    team1Data.roster_id,
    team2Data.roster_id,
    { matchups: allMatchups, league: seasons[year]?.league, year }
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

  // The winner's accent, for the share card's rule. A tie has no winner, and a
  // roster with no manager entry falls back to the template's neutral ink.
  const winnerAccent = (() => {
    if (winner === null) return undefined;
    const roster = rosters.find((r) => r.roster_id === winner);
    const manager = managers.find((m) => m.sleeper.id === roster?.owner_id);
    return manager ? getManagerAccent(manager.id) : undefined;
  })();

  // Prepare team data for looping
  const teams = [
    {
      name: team1Name,
      data: team1Data,
      ownerId: team1Roster?.owner_id,
      manager: managers.find((m) => m.sleeper.id === team1Roster?.owner_id),
      players: team1Players,
      optimal: team1Optimal,
      record: team1Record,
      streak: team1Streak,
    },
    {
      name: team2Name,
      data: team2Data,
      ownerId: team2Roster?.owner_id,
      manager: managers.find((m) => m.sleeper.id === team2Roster?.owner_id),
      players: team2Players,
      optimal: team2Optimal,
      record: team2Record,
      streak: team2Streak,
    },
  ];

  return (
    <div className="container mx-auto space-y-6">
      {/* I4: the page's card at the end of the page's top row — the rule is
          that a share control ends the heading of the thing it shares, and
          here the breadcrumb is the heading. */}
      <div className="flex items-start justify-between gap-3">
        <Breadcrumbs
          crumbs={[
            { label: "Seasons", to: "/seasons" },
            { label: String(year), to: `/seasons/${year}/standings` },
            { label: "Matchups", to: `/seasons/${year}/matchups` },
            { label: `Week ${week}` },
            { label: `${teams[0].name} vs ${teams[1].name}` },
          ]}
        />
        {/* G2/G3/G4: the whole point of the project — "I love it when one of the
            managers goes on the site and then comes back and shares a nugget".
            The card is built on click rather than up front, because embedding
            the avatars is a fetch and nobody should pay for it just by opening
            a matchup. */}
        <ShareButton
          what="final score"
          card={async () => {
            const [{ finalScoreCard }, { embedImage }] = await Promise.all([
              import("@/presentation/components/ShareCard/templates"),
              import("@/presentation/components/ShareCard"),
            ]);
            const sides = await Promise.all(
              teams.map(async (team) => ({
                name: team.name,
                score: team.data.points ?? 0,
                avatar: await avatarDataUri(embedImage, users, team.ownerId),
              }))
            );
            return finalScoreCard({
              year,
              week,
              teams: [sides[0], sides[1]] as const,
              // One manager's accent, and only as a rule: the winner's, so the
              // card is not a neutral grey slab. Two accents would collide.
              accent: winnerAccent,
            });
          }}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* E7: what this game was, if it was anything. Renders nothing at all on
            an ordinary week — the rail is only worth reading because it stays
            quiet the rest of the time. */}
        <NarrativeNotes
          subject={{
            year,
            week,
            managerIds: teams
              .map((team) => team.manager?.id)
              .filter((id): id is string => Boolean(id)),
          }}
        />

      </div>

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
                {/* I5. A stand-in ran this team this week; the result still
                    belongs to the manager who built it (the league's rule),
                    and the site already credits it that way — this only
                    says who was actually picking the lineup. */}
                {(() => {
                  const standInId = interimManager(year, week, team.manager?.id);
                  const standIn = standInId
                    ? managers.find((m) => m.id === standInId)
                    : undefined;
                  if (!standIn) return null;
                  return (
                    <p className="mt-0.5 text-xs text-amber-800">
                      Managed by{" "}
                      <Link
                        to={`/managers/${standIn.id}`}
                        className="font-medium underline decoration-dotted underline-offset-2"
                      >
                        {standIn.name}
                      </Link>{" "}
                      this week — the result counts to {team.manager?.name}
                    </p>
                  );
                })()}
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
              {year} H2H (Regular Season)
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
          <div
            key={teamIdx}
            className="bg-white rounded-lg shadow overflow-hidden"
          >
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
                      <td className="py-2">
                        {player.playerId === 0 || player.playerId === "0" ? (
                          <>
                            {player.name}
                            {(() => {
                              const nickname = getPlayerNickname(
                                player.playerId,
                                teamIdx === 0 ? team1Roster : team2Roster
                              );
                              return nickname ? (
                                <span className="text-gray-500 ml-1">
                                  ({nickname})
                                </span>
                              ) : null;
                            })()}
                          </>
                        ) : (
                          <Link
                            to={`/players/${player.playerId}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {player.name}
                            {(() => {
                              const nickname = getPlayerNickname(
                                player.playerId,
                                teamIdx === 0 ? team1Roster : team2Roster
                              );
                              return nickname ? (
                                <span className="text-gray-500 ml-1">
                                  ({nickname})
                                </span>
                              ) : null;
                            })()}
                          </Link>
                        )}
                        <StatLine
                          gameday={gameday}
                          playerId={player.playerId}
                          position={player.position}
                        />
                      </td>
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
                        <td className="py-2">
                          {player.playerId === 0 || player.playerId === "0" ? (
                            <>
                              {player.name}
                              {(() => {
                                const nickname = getPlayerNickname(
                                  player.playerId,
                                  teamIdx === 0 ? team1Roster : team2Roster
                                );
                                return nickname ? (
                                  <span className="text-gray-500 ml-1">
                                    ({nickname})
                                  </span>
                                ) : null;
                              })()}
                            </>
                          ) : (
                            <Link
                              to={`/players/${player.playerId}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {player.name}
                              {(() => {
                                const nickname = getPlayerNickname(
                                  player.playerId,
                                  teamIdx === 0 ? team1Roster : team2Roster
                                );
                                return nickname ? (
                                  <span className="text-gray-500 ml-1">
                                    ({nickname})
                                  </span>
                                ) : null;
                              })()}
                            </Link>
                          )}
                          <StatLine
                            gameday={gameday}
                            playerId={player.playerId}
                            position={player.position}
                          />
                        </td>
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

      {/* nflverse's data is CC-BY: the credit goes wherever it is shown. */}
      {gameday && (
        <p className="text-xs text-ink-faint">
          Stat lines and NFL teams from the{" "}
          <a
            href="https://github.com/nflverse/nflverse-data"
            className="underline decoration-dotted underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            nflverse
          </a>{" "}
          play-by-play (CC-BY 4.0). Fantasy points are Sleeper's.
        </p>
      )}

      {/* E2: where to go next, as opposed to E7's what-was-notable at the top.
          It sits BELOW the score sheets on purpose — the scores are what the
          page is for, and the moment you want somewhere else to be is the
          moment you have finished reading them. Renders nothing at all when
          there is nothing real to point at. */}
      <MatchupSeeAlso
        year={year}
        week={week}
        matchupId={team1Data.matchup_id}
        teams={[
          {
            rosterId: team1Data.roster_id,
            managerId: teams[0].manager?.id ?? null,
            name: teams[0].name,
          },
          {
            rosterId: team2Data.roster_id,
            managerId: teams[1].manager?.id ?? null,
            name: teams[1].name,
          },
        ]}
        matchups={allMatchups}
        nameOf={(rosterId) =>
          getTeamName(
            rosters.find((roster) => roster.roster_id === rosterId)?.owner_id ||
              ""
          )
        }
        // The league comes off the eager season data rather than a new prop:
        // `history.tsx` already has it, but threading it through would mean
        // editing a file this task does not own for something that is free
        // here.
        isPlayed={(candidate) =>
          isWeekCompleted(candidate, seasons[year]?.league)
        }
        teamCount={rosters.length}
      />
    </div>
  );
};

export default MatchupDetail;
