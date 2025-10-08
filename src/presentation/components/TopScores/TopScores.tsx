import { useMemo, useState, useEffect } from "react";
import { Link, useParams, NavLink } from "react-router-dom";
import { useFormatter } from "use-intl";
import { seasons } from "../../../data";
import managers from "../../../data/managers.json";
import { ExtendedMatchup } from "../../../types/matchup";
import { ExtendedRoster } from "../../../types/roster";
import { getUserByOwnerId, getUserAvatarUrl } from "../../../utils/userAvatar";
import { getPlayer } from "../../../data";
import { getPlayerImageUrl } from "../../../utils/playerImage";

type ScoreMode = "team-score" | "match-total" | "player-score";
type SortOrder = "high-to-low" | "low-to-high";

interface TopScore {
  owner_id: string;
  manager_name: string;
  team_name: string;
  year: number;
  week: number;
  score: number;
  opponent_id: string;
  opponent_name: string;
  matchup_id: number;
}

interface MatchTotal {
  year: number;
  week: number;
  matchup_id: number;
  team1_id: string;
  team1_name: string;
  team1_score: number;
  team2_id: string;
  team2_name: string;
  team2_score: number;
  total_score: number;
}

interface PlayerScore {
  player_id: string;
  player_name: string;
  year: number;
  week: number;
  score: number;
  owner_id: string;
  manager_name: string;
  team_name: string;
  matchup_id: number;
  was_started: boolean;
  is_playoff: boolean;
  is_championship: boolean;
}

const TopScores = () => {
  const { number } = useFormatter();
  const { subTab } = useParams<{ subTab: string }>();
  const [displayCount, setDisplayCount] = useState<number>(20);
  const [sortOrder, setSortOrder] = useState<SortOrder>("high-to-low");

  const scoreMode = (subTab as ScoreMode) || "team-score";

  const topScores = useMemo(() => {
    if (scoreMode === "team-score") {
      const allScores: TopScore[] = [];

      // Process each year
      Object.entries(seasons).forEach(([yearStr, seasonData]) => {
        const year = parseInt(yearStr);
        if (!seasonData?.rosters || !seasonData?.matchups || !seasonData?.users)
          return;

        const rosters = seasonData.rosters as ExtendedRoster[];
        const matchups = seasonData.matchups as {
          [key: string]: ExtendedMatchup[];
        };

        // Get playoff week start to filter out playoff games
        const playoffWeekStart =
          seasonData.league?.settings?.playoff_week_start || 15;

        // Process each week
        Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
          const week = parseInt(weekStr);

          // Skip playoff weeks except for elimination/championship games
          if (week >= playoffWeekStart) {
            const hasMeaningfulPlayoffGame = weekMatchups.some((matchup) => {
              const bracketMatch = seasonData.winners_bracket?.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );
              return bracketMatch && (!bracketMatch.p || bracketMatch.p === 1);
            });
            if (!hasMeaningfulPlayoffGame) return;
          }

          // Process each matchup in the week
          weekMatchups.forEach((matchup) => {
            const roster = rosters.find(
              (r) => r.roster_id === matchup.roster_id
            );
            if (!roster) return;

            // For playoff weeks, check if this specific matchup is meaningful
            if (week >= playoffWeekStart) {
              const bracketMatch = seasonData.winners_bracket?.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );
              if (!bracketMatch || (bracketMatch.p && bracketMatch.p !== 1))
                return;
            }

            const manager = managers.find(
              (m) => m.sleeper.id === roster.owner_id
            );
            if (!manager) return;

            // Find the opponent in this matchup
            const opponentMatchup = weekMatchups.find(
              (m) =>
                m.matchup_id === matchup.matchup_id &&
                m.roster_id !== matchup.roster_id
            );

            if (!opponentMatchup) return;

            const opponentRoster = rosters.find(
              (r) => r.roster_id === opponentMatchup.roster_id
            );
            const opponentManager = opponentRoster
              ? managers.find((m) => m.sleeper.id === opponentRoster.owner_id)
              : null;

            allScores.push({
              owner_id: roster.owner_id,
              manager_name: manager.name,
              team_name: manager.teamName || manager.sleeper.display_name,
              year,
              week,
              score: matchup.points,
              opponent_id: opponentRoster?.owner_id || "",
              opponent_name:
                opponentManager?.teamName ||
                opponentManager?.sleeper.display_name ||
                "Unknown",
              matchup_id: matchup.matchup_id,
            });
          });
        });
      });

      return allScores.sort((a, b) =>
        sortOrder === "high-to-low" ? b.score - a.score : a.score - b.score
      );
    }

    if (scoreMode === "match-total") {
      const allMatchTotals: MatchTotal[] = [];

      // Process each year
      Object.entries(seasons).forEach(([yearStr, seasonData]) => {
        const year = parseInt(yearStr);
        if (!seasonData?.rosters || !seasonData?.matchups) return;

        const rosters = seasonData.rosters as ExtendedRoster[];
        const matchups = seasonData.matchups as {
          [key: string]: ExtendedMatchup[];
        };

        const playoffWeekStart =
          seasonData.league?.settings?.playoff_week_start || 15;

        // Process each week
        Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
          const week = parseInt(weekStr);

          // Skip playoff weeks except for elimination/championship games
          if (week >= playoffWeekStart) {
            const hasMeaningfulPlayoffGame = weekMatchups.some((matchup) => {
              const bracketMatch = seasonData.winners_bracket?.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );
              return bracketMatch && (!bracketMatch.p || bracketMatch.p === 1);
            });
            if (!hasMeaningfulPlayoffGame) return;
          }

          // Group matchups by matchup_id to get pairs
          const matchupGroups = new Map<number, ExtendedMatchup[]>();
          weekMatchups.forEach((matchup) => {
            if (!matchupGroups.has(matchup.matchup_id)) {
              matchupGroups.set(matchup.matchup_id, []);
            }
            matchupGroups.get(matchup.matchup_id)!.push(matchup);
          });

          // Process each matchup pair
          matchupGroups.forEach((matchupPair) => {
            if (matchupPair.length !== 2) return; // Skip incomplete matchups

            const [team1, team2] = matchupPair;

            // For playoff weeks, check if this matchup is ineligible
            if (week >= playoffWeekStart) {
              // Check if either team is in losers_bracket (exclude these)
              const isInLosersBracket = seasonData.losers_bracket?.some(
                (lb) =>
                  lb.t1 === team1.roster_id ||
                  lb.t2 === team1.roster_id ||
                  lb.t1 === team2.roster_id ||
                  lb.t2 === team2.roster_id
              );

              if (isInLosersBracket) return; // Skip losers bracket games

              // Check if this matchup is in winners_bracket and is meaningful (elimination or championship)
              const bracketMatch = seasonData.winners_bracket?.find(
                (bm) =>
                  (bm.t1 === team1.roster_id || bm.t2 === team1.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );

              // Only include if it's in winners_bracket and is either elimination (no p property) or championship (p: 1)
              if (!bracketMatch || (bracketMatch.p && bracketMatch.p !== 1))
                return;
            }

            const team1Roster = rosters.find(
              (r) => r.roster_id === team1.roster_id
            );
            const team2Roster = rosters.find(
              (r) => r.roster_id === team2.roster_id
            );

            if (!team1Roster || !team2Roster) return;

            const team1Manager = managers.find(
              (m) => m.sleeper.id === team1Roster.owner_id
            );
            const team2Manager = managers.find(
              (m) => m.sleeper.id === team2Roster.owner_id
            );

            if (!team1Manager || !team2Manager) return;

            allMatchTotals.push({
              year,
              week,
              matchup_id: team1.matchup_id,
              team1_id: team1Roster.owner_id,
              team1_name:
                team1Manager.teamName || team1Manager.sleeper.display_name,
              team1_score: team1.points,
              team2_id: team2Roster.owner_id,
              team2_name:
                team2Manager.teamName || team2Manager.sleeper.display_name,
              team2_score: team2.points,
              total_score: team1.points + team2.points,
            });
          });
        });
      });

      return allMatchTotals.sort((a, b) =>
        sortOrder === "high-to-low"
          ? b.total_score - a.total_score
          : a.total_score - b.total_score
      );
    }

    if (scoreMode === "player-score") {
      const allPlayerScores: PlayerScore[] = [];

      // Process each year
      Object.entries(seasons).forEach(([yearStr, seasonData]) => {
        const year = parseInt(yearStr);
        if (!seasonData?.rosters || !seasonData?.matchups) return;

        const rosters = seasonData.rosters as ExtendedRoster[];
        const matchups = seasonData.matchups as {
          [key: string]: ExtendedMatchup[];
        };

        const playoffWeekStart =
          seasonData.league?.settings?.playoff_week_start || 15;

        // Process each week
        Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
          const week = parseInt(weekStr);

          // Skip playoff weeks except for elimination/championship games
          if (week >= playoffWeekStart) {
            const hasMeaningfulPlayoffGame = weekMatchups.some((matchup) => {
              const bracketMatch = seasonData.winners_bracket?.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );
              return bracketMatch && (!bracketMatch.p || bracketMatch.p === 1);
            });
            if (!hasMeaningfulPlayoffGame) return;
          }

          // Process each matchup in the week
          weekMatchups.forEach((matchup) => {
            const roster = rosters.find(
              (r) => r.roster_id === matchup.roster_id
            );
            if (!roster) return;

            // For playoff weeks, check if this specific matchup is meaningful
            if (week >= playoffWeekStart) {
              const bracketMatch = seasonData.winners_bracket?.find(
                (bm) =>
                  (bm.t1 === matchup.roster_id ||
                    bm.t2 === matchup.roster_id) &&
                  bm.r === week - playoffWeekStart + 1
              );
              if (!bracketMatch || (bracketMatch.p && bracketMatch.p !== 1))
                return;
            }

            const manager = managers.find(
              (m) => m.sleeper.id === roster.owner_id
            );
            if (!manager) return;

            // Process each player in the matchup
            Object.entries(matchup.players_points || {}).forEach(
              ([playerId, points]) => {
                if (typeof points !== "number" || points <= 0) return;

                const player = getPlayer(playerId, year);
                if (!player) return;

                const wasStarted =
                  matchup.starters?.includes(playerId) || false;

                // Check if this is a playoff or championship game
                let isPlayoff = false;
                let isChampionship = false;

                if (week >= playoffWeekStart) {
                  const bracketMatch = seasonData.winners_bracket?.find(
                    (bm) =>
                      (bm.t1 === matchup.roster_id ||
                        bm.t2 === matchup.roster_id) &&
                      bm.r === week - playoffWeekStart + 1
                  );

                  if (bracketMatch) {
                    isPlayoff = true;
                    isChampionship = bracketMatch.p === 1;
                  }
                }

                allPlayerScores.push({
                  player_id: playerId,
                  player_name:
                    player.full_name || player.last_name || "Unknown Player",
                  year,
                  week,
                  score: points,
                  owner_id: roster.owner_id,
                  manager_name: manager.name,
                  team_name: manager.teamName || manager.sleeper.display_name,
                  matchup_id: matchup.matchup_id,
                  was_started: wasStarted,
                  is_playoff: isPlayoff,
                  is_championship: isChampionship,
                });
              }
            );
          });
        });
      });

      return allPlayerScores.sort((a, b) =>
        sortOrder === "high-to-low" ? b.score - a.score : a.score - b.score
      );
    }

    return [];
  }, [scoreMode, sortOrder]);

  const getMatchupUrl = (score: TopScore | MatchTotal | PlayerScore) => {
    return `/history/${score.year}/matchups/${score.week}/${score.matchup_id}`;
  };

  const handleLoadMore = () => {
    setDisplayCount((prev) => prev + 20);
  };

  const handleSortOrderChange = (newSortOrder: SortOrder) => {
    setSortOrder(newSortOrder);
    setDisplayCount(20); // Reset to 20 when changing sort order
  };

  // Reset display count when mode changes
  useEffect(() => {
    setDisplayCount(20);
  }, [scoreMode]);

  const renderTeamScoreCard = (score: TopScore, index: number) => {
    const user = getUserByOwnerId(score.owner_id, seasons[score.year]?.users);
    const avatarUrl = getUserAvatarUrl(user);

    return (
      <Link
        key={`${score.year}-${score.week}-${score.owner_id}-${index}`}
        to={getMatchupUrl(score)}
        className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group block"
      >
        {/* Rank Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-sm">
              #{index + 1}
            </div>
            <div className="ml-3">
              <div className="text-lg font-bold text-gray-900">
                {number(score.score, { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500">points</div>
            </div>
          </div>
        </div>

        {/* Manager Info */}
        <div className="flex items-center mb-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${score.manager_name} avatar`}
              className="w-10 h-10 rounded-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-500">
              {score.manager_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="ml-3">
            <div className="font-medium text-gray-900 text-sm">
              {score.team_name}
            </div>
            <div className="text-xs text-gray-500">{score.manager_name}</div>
          </div>
        </div>

        {/* Game Details */}
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Year:</span>
            <span className="font-medium">{score.year}</span>
          </div>
          <div className="flex justify-between">
            <span>Week:</span>
            <span className="font-medium">{score.week}</span>
          </div>
          <div className="flex justify-between">
            <span>vs:</span>
            <div className="flex items-center">
              <span
                className="font-medium truncate ml-2"
                title={score.opponent_name}
              >
                {score.opponent_name}
              </span>
              <span className="ml-2 text-xs font-bold">
                {(() => {
                  // Find the matchup data to determine win/loss/tie
                  const seasonData = seasons[score.year];
                  if (!seasonData?.matchups) return null;

                  const weekMatchups =
                    seasonData.matchups[
                      score.week.toString() as keyof typeof seasonData.matchups
                    ];
                  if (!weekMatchups) return null;

                  const teamMatchup = weekMatchups.find(
                    (m: ExtendedMatchup) => {
                      const roster = seasonData.rosters?.find(
                        (r) => r.owner_id === score.owner_id
                      );
                      return roster && m.roster_id === roster.roster_id;
                    }
                  );
                  const opponentMatchup = weekMatchups.find(
                    (m: ExtendedMatchup) => {
                      const roster = seasonData.rosters?.find(
                        (r) => r.owner_id === score.opponent_id
                      );
                      return roster && m.roster_id === roster.roster_id;
                    }
                  );

                  if (!teamMatchup || !opponentMatchup) return null;

                  if (teamMatchup.points > opponentMatchup.points) {
                    return <span className="text-green-600">(W)</span>;
                  } else if (teamMatchup.points < opponentMatchup.points) {
                    return <span className="text-red-600">(L)</span>;
                  } else {
                    return <span className="text-yellow-600">(T)</span>;
                  }
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* Hover Effect */}
        <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to view matchup →
        </div>
      </Link>
    );
  };

  const renderMatchTotalCard = (match: MatchTotal, index: number) => {
    const team1User = getUserByOwnerId(
      match.team1_id,
      seasons[match.year]?.users
    );
    const team2User = getUserByOwnerId(
      match.team2_id,
      seasons[match.year]?.users
    );
    const team1AvatarUrl = getUserAvatarUrl(team1User);
    const team2AvatarUrl = getUserAvatarUrl(team2User);

    return (
      <Link
        key={`${match.year}-${match.week}-${match.matchup_id}-${index}`}
        to={getMatchupUrl(match)}
        className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group block"
      >
        {/* Rank Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              #{index + 1}
            </div>
            <div className="ml-3">
              <div className="text-lg font-bold text-gray-900">
                {number(match.total_score, { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500">total points</div>
            </div>
          </div>
        </div>

        {/* Matchup Details */}
        <div className="space-y-2 mb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              {team1AvatarUrl ? (
                <img
                  src={team1AvatarUrl}
                  alt={`${match.team1_name} avatar`}
                  className="w-6 h-6 rounded-full object-cover mr-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                  {match.team1_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className="text-sm font-medium text-gray-900 truncate"
                title={match.team1_name}
              >
                {match.team1_name}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {number(match.team1_score, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-center text-xs text-gray-500">vs</div>
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              {team2AvatarUrl ? (
                <img
                  src={team2AvatarUrl}
                  alt={`${match.team2_name} avatar`}
                  className="w-6 h-6 rounded-full object-cover mr-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                  {match.team2_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className="text-sm font-medium text-gray-900 truncate"
                title={match.team2_name}
              >
                {match.team2_name}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {number(match.team2_score, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Game Details */}
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Year:</span>
            <span className="font-medium">{match.year}</span>
          </div>
          <div className="flex justify-between">
            <span>Week:</span>
            <span className="font-medium">{match.week}</span>
          </div>
        </div>

        {/* Hover Effect */}
        <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to view matchup →
        </div>
      </Link>
    );
  };

  const renderPlayerScoreCard = (player: PlayerScore, index: number) => {
    const user = getUserByOwnerId(player.owner_id, seasons[player.year]?.users);
    const avatarUrl = getUserAvatarUrl(user);
    const playerImageUrl = getPlayerImageUrl(
      player.player_id,
      player.year.toString()
    );

    return (
      <Link
        key={`${player.year}-${player.week}-${player.player_id}-${index}`}
        to={getMatchupUrl(player)}
        className="bg-white rounded-lg shadow-md border border-gray-200 p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group block"
      >
        {/* Rank Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm">
              #{index + 1}
            </div>
            <div className="ml-3">
              <div className="text-lg font-bold text-gray-900">
                {number(player.score, { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500">points</div>
            </div>
          </div>
        </div>

        {/* Player Info */}
        <div className="mb-3">
          <div className="flex items-center mb-2">
            {playerImageUrl ? (
              <img
                src={playerImageUrl}
                alt={`${player.player_name} photo`}
                className="w-8 h-8 rounded-full object-cover mr-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500 mr-2">
                {player.player_name.charAt(0).toUpperCase()}
              </div>
            )}
            <Link
              to={`/players/${player.player_id}`}
              className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-sm"
            >
              {player.player_name}
            </Link>
          </div>
          <div className="flex items-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${player.manager_name} avatar`}
                className="w-6 h-6 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                {player.manager_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="ml-2">
              <div className="text-xs font-medium text-gray-700">
                {player.team_name}
              </div>
              <div className="text-xs text-gray-500">{player.manager_name}</div>
            </div>
          </div>
        </div>

        {/* Game Details */}
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Year:</span>
            <span className="font-medium">{player.year}</span>
          </div>
          <div className="flex justify-between">
            <span>Week:</span>
            <span className="font-medium">
              {player.week}
              {player.is_championship && " 🏆"}
              {player.is_playoff && !player.is_championship && " ⭐"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Started:</span>
            <span
              className={`font-medium ${
                player.was_started ? "text-green-600" : "text-red-600"
              }`}
            >
              {player.was_started ? "Yes" : "No"}
            </span>
          </div>
        </div>

        {/* Hover Effect */}
        <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to view matchup →
        </div>
      </Link>
    );
  };

  return (
    <div className="container mx-auto">
      {/* Mode Selector and Sort Options */}
      <div className="mb-6">
        <div className="flex gap-2 items-center justify-between">
          <div className="flex gap-2">
            <NavLink
              to="/top-scores/team-score"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive || (!subTab && scoreMode === "team-score")
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`
              }
            >
              Team Score
            </NavLink>
            <NavLink
              to="/top-scores/match-total"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`
              }
            >
              Match Total
            </NavLink>
            <NavLink
              to="/top-scores/player-score"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-blue-800 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`
              }
            >
              Player Score
            </NavLink>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Sort by:
            </label>
            <select
              value={sortOrder}
              onChange={(e) =>
                handleSortOrderChange(e.target.value as SortOrder)
              }
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="high-to-low">High to Low</option>
              <option value="low-to-high">Low to High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {scoreMode === "team-score" &&
          (topScores as TopScore[])
            .slice(0, displayCount)
            .map((score, index) => renderTeamScoreCard(score, index))}
        {scoreMode === "match-total" &&
          (topScores as MatchTotal[])
            .slice(0, displayCount)
            .map((match, index) => renderMatchTotalCard(match, index))}
        {scoreMode === "player-score" &&
          (topScores as PlayerScore[])
            .slice(0, displayCount)
            .map((player, index) => renderPlayerScoreCard(player, index))}
      </div>

      {/* Load More Button */}
      {topScores.length > displayCount && (
        <div className="text-center mt-8">
          <button
            onClick={handleLoadMore}
            className="px-6 py-3 bg-blue-800 text-white rounded-lg font-medium hover:bg-blue-900 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {topScores.length === 0 && (
        <div className="text-center py-8 text-gray-500">No scores found</div>
      )}
    </div>
  );
};

export default TopScores;
