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

  // Check if divisions are used
  const hasDivisions = !!(
    league?.settings?.divisions && league.settings.divisions > 0
  );

  // Get division names and avatars from metadata
  const getDivisionInfo = (divisionNumber: number) => {
    if (!hasDivisions || !league.metadata) {
      return { name: `Division ${divisionNumber}`, avatar: null };
    }

    const divisionKey =
      `division_${divisionNumber}` as keyof typeof league.metadata;
    const avatarKey =
      `division_${divisionNumber}_avatar` as keyof typeof league.metadata;

    return {
      name: league.metadata[divisionKey] || `Division ${divisionNumber}`,
      avatar: league.metadata[avatarKey] || null,
    };
  };

  // Group standings by division if divisions exist
  const groupedStandings = hasDivisions
    ? standings.reduce((acc, roster) => {
        const division = roster.settings.division || 1;
        if (!acc[division]) {
          acc[division] = [];
        }
        acc[division].push(roster);
        return acc;
      }, {} as Record<number, ExtendedRoster[]>)
    : { 0: standings }; // Single group when no divisions

  // Calculate H2H record between two teams
  const getH2HRecord = (team1: ExtendedRoster, team2: ExtendedRoster) => {
    if (!matchups) return { wins: 0, losses: 0, ties: 0 };

    let wins = 0,
      losses = 0,
      ties = 0;

    const playoffWeekStart = league?.settings?.playoff_week_start || 15;

    Object.keys(matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);

      // Skip playoff weeks - only count regular season games
      if (weekNum >= playoffWeekStart) return;

      const weekMatchups = matchups[weekKey];
      const team1Matchup = weekMatchups.find(
        (m) => m.roster_id === team1.roster_id
      );
      const team2Matchup = weekMatchups.find(
        (m) => m.roster_id === team2.roster_id
      );

      if (
        team1Matchup &&
        team2Matchup &&
        team1Matchup.matchup_id === team2Matchup.matchup_id
      ) {
        if (team1Matchup.points > team2Matchup.points) wins++;
        else if (team1Matchup.points < team2Matchup.points) losses++;
        else ties++;
      }
    });

    return { wins, losses, ties };
  };

  // Calculate division record for a team
  const getDivisionRecord = (
    team: ExtendedRoster,
    divisionTeams: ExtendedRoster[]
  ) => {
    if (!matchups) return { wins: 0, losses: 0, ties: 0 };

    let wins = 0,
      losses = 0,
      ties = 0;

    const playoffWeekStart = league?.settings?.playoff_week_start || 15;

    Object.keys(matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);

      // Skip playoff weeks - only count regular season games
      if (weekNum >= playoffWeekStart) return;

      const weekMatchups = matchups[weekKey];
      const teamMatchup = weekMatchups.find(
        (m) => m.roster_id === team.roster_id
      );

      if (teamMatchup) {
        // Find opponent in this matchup
        const opponentMatchup = weekMatchups.find(
          (m) =>
            m.matchup_id === teamMatchup.matchup_id &&
            m.roster_id !== team.roster_id
        );

        if (opponentMatchup) {
          // Check if opponent is in the same division
          const opponentTeam = divisionTeams.find(
            (t) => t.roster_id === opponentMatchup.roster_id
          );
          if (opponentTeam) {
            if (teamMatchup.points > opponentMatchup.points) wins++;
            else if (teamMatchup.points < opponentMatchup.points) losses++;
            else ties++;
          }
        }
      }
    });

    return { wins, losses, ties };
  };

  // Sort divisions and teams within each division
  const sortedDivisions = Object.entries(groupedStandings)
    .map(([division, teams]) => ({
      division: parseInt(division),
      teams: teams.sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        // First tiebreaker: Win percentage
        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        // For division years, use division-specific tiebreakers
        if (hasDivisions) {
          // Second tiebreaker: H2H record
          const h2hRecord = getH2HRecord(a, b);
          const totalH2HGames =
            h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

          // Only use H2H if teams actually played each other
          if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
            return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
          }

          // Third tiebreaker: Division record
          const aDivRecord = getDivisionRecord(a, teams);
          const bDivRecord = getDivisionRecord(b, teams);
          const aDivWinPct =
            aDivRecord.wins /
            (aDivRecord.wins + aDivRecord.losses + aDivRecord.ties);
          const bDivWinPct =
            bDivRecord.wins /
            (bDivRecord.wins + bDivRecord.losses + bDivRecord.ties);

          if (aDivWinPct !== bDivWinPct) return bDivWinPct - aDivWinPct;
        } else {
          // For non-division years, only use H2H for 2012
          if (currentYear === 2012) {
            const h2hRecord = getH2HRecord(a, b);
            const totalH2HGames =
              h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

            // Only use H2H if teams actually played each other
            if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
              return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
            }
          }
        }

        // Final tiebreaker: Points
        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      }),
    }))
    .sort((a, b) => a.division - b.division);

  // Get playoff placements
  const firstPlace = winnersBracket?.find((m) => m.p === 1);
  const thirdPlace = winnersBracket?.find((m) => m.p === 3);

  // Determine playoff teams and their seeding by analyzing bracket structure
  const getPlayoffTeams = () => {
    if (!winnersBracket || !league?.settings?.playoff_teams) {
      return { playoffTeams: new Set<number>(), playoffTeamSeeds: {} };
    }

    const playoffTeams = new Set<number>();
    const playoffTeamSeeds: Record<number, number> = {};

    // Get all teams that appear in the winners bracket (these are the playoff teams)
    winnersBracket.forEach((match) => {
      if (match.t1) playoffTeams.add(match.t1);
      if (match.t2) playoffTeams.add(match.t2);
    });

    if (hasDivisions) {
      // For division-based leagues, analyze bracket structure to determine seeds
      // Find teams that get byes (don't appear in first round)
      const firstRoundTeams = new Set<number>();
      const byeTeams = new Set<number>();

      // Find the first round (lowest round number)
      const firstRound = Math.min(...winnersBracket.map((m) => m.r));

      winnersBracket.forEach((match) => {
        if (match.r === firstRound) {
          if (match.t1) firstRoundTeams.add(match.t1);
          if (match.t2) firstRoundTeams.add(match.t2);
        }
      });

      // Teams with byes are playoff teams that don't appear in first round
      playoffTeams.forEach((teamId) => {
        if (!firstRoundTeams.has(teamId)) {
          byeTeams.add(teamId);
        }
      });

      // Assign seeds 1-2 to bye teams (division winners, sorted by their division standings)
      const byeTeamRosters = [...standings]
        .filter((r) => byeTeams.has(r.roster_id))
        .sort((a, b) => {
          const aWinPct =
            a.settings.wins /
            (a.settings.wins + a.settings.losses + a.settings.ties);
          const bWinPct =
            b.settings.wins /
            (b.settings.wins + b.settings.losses + b.settings.ties);

          if (aWinPct !== bWinPct) return bWinPct - aWinPct;

          const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
          const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
          return bPoints - aPoints;
        });

      let seed = 1;
      byeTeamRosters.forEach((roster) => {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      });

      // Assign seeds 3-6 to remaining playoff teams (first round participants)
      const firstRoundRosters = [...standings]
        .filter((r) => firstRoundTeams.has(r.roster_id))
        .sort((a, b) => {
          const aWinPct =
            a.settings.wins /
            (a.settings.wins + a.settings.losses + a.settings.ties);
          const bWinPct =
            b.settings.wins /
            (b.settings.wins + b.settings.losses + b.settings.ties);

          if (aWinPct !== bWinPct) return bWinPct - aWinPct;

          const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
          const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
          return bPoints - aPoints;
        });

      firstRoundRosters.forEach((roster) => {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      });
    } else {
      // For non-division leagues, use simple overall standings
      const sortedStandings = [...standings].sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      });

      let seed = 1;
      sortedStandings.forEach((roster) => {
        if (playoffTeams.has(roster.roster_id)) {
          playoffTeamSeeds[roster.roster_id] = seed;
          seed++;
        }
      });
    }

    return { playoffTeams, playoffTeamSeeds };
  };

  const { playoffTeams, playoffTeamSeeds } = getPlayoffTeams();

  // Determine if a team gets a bye (top 2 seeds in 12-team leagues, or all playoff teams in 10-team leagues)
  const getPlayoffHighlight = (rosterId: number) => {
    if (!playoffTeams.has(rosterId)) return null;

    const seed = playoffTeamSeeds[rosterId];
    const numTeams = league?.settings?.num_teams || 12;

    // In 10-team leagues, all playoff teams get green (no byes)
    if (numTeams === 10) {
      return "playoff";
    }

    // In 12-team leagues, top 2 seeds get byes (green), others get yellow
    if (seed <= 2) {
      return "bye";
    } else {
      return "playoff";
    }
  };

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
      {sortedDivisions.map(({ division, teams }) => (
        <div key={division} className={hasDivisions ? "mb-8" : ""}>
          {hasDivisions && (
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                {(() => {
                  const divisionInfo = getDivisionInfo(division);
                  return (
                    <>
                      {divisionInfo.avatar && (
                        <img
                          src={divisionInfo.avatar}
                          alt={`${divisionInfo.name} avatar`}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      )}
                      {divisionInfo.name}
                    </>
                  );
                })()}
              </h2>
              <div className="border-b-2 border-gray-300"></div>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Rank</th>
                <th className="text-left p-3">Team</th>
                <th className="text-center p-3">W</th>
                <th className="text-center p-3">L</th>
                <th className="text-center p-3">T</th>
                <th className="text-center p-3">Win %</th>
                {hasDivisions && (
                  <th className="text-center p-3">Div Record</th>
                )}
                <th className="text-right p-3">Points For</th>
                <th className="text-right p-3">Points Against</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teams.map((roster: ExtendedRoster, index: number) => {
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

                // Calculate division record if divisions exist
                const divisionRecord = hasDivisions
                  ? getDivisionRecord(
                      roster,
                      standings.filter(
                        (t) =>
                          (t.settings.division || 1) ===
                          (roster.settings.division || 1)
                      )
                    )
                  : null;

                const isChampion =
                  isSeasonComplete && firstPlace?.w === roster.roster_id;
                const isRunnerUp =
                  isSeasonComplete && firstPlace?.l === roster.roster_id;
                const isThirdPlace =
                  isSeasonComplete && thirdPlace?.w === roster.roster_id;
                const isTopScorer =
                  isSeasonComplete && roster.roster_id === topScorer.roster_id;
                const isBottomScorer =
                  isSeasonComplete &&
                  roster.roster_id === bottomScorer.roster_id;

                const playoffHighlight = getPlayoffHighlight(roster.roster_id);
                const rowClassName = `hover:bg-gray-50 ${
                  playoffHighlight === "bye"
                    ? "bg-green-50 border-l-4 border-green-500"
                    : playoffHighlight === "playoff"
                    ? "bg-yellow-50 border-l-4 border-yellow-500"
                    : ""
                }`;

                return (
                  <tr key={roster.roster_id} className={rowClassName}>
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
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                                  {teamName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              {managerId ? (
                                <button
                                  onClick={() =>
                                    navigate(`/managers/${managerId}`)
                                  }
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
                    <td className="text-center p-3">
                      {roster.settings.losses}
                    </td>
                    <td className="text-center p-3">{roster.settings.ties}</td>
                    <td className="text-center p-3">
                      {number(winPerc, {
                        maximumFractionDigits: 3,
                        minimumFractionDigits: 3,
                      })}
                    </td>
                    {hasDivisions && divisionRecord && (
                      <td className="text-center p-3 text-xs">
                        {divisionRecord.wins}-{divisionRecord.losses}
                        {divisionRecord.ties > 0 && `-${divisionRecord.ties}`}
                      </td>
                    )}
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
      ))}

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
