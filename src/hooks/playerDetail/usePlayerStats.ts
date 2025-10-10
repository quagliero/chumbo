import { useMemo } from "react";
import { seasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import {
  getPlayoffWeekStart,
  isPlayoffWeek,
  isMeaningfulPlayoffGame,
} from "@/utils/playoffUtils";
import { getTeamName } from "@/utils/teamName";
import type {
  PlayerPerformance,
  OwnerStats,
  PlayerStats,
} from "@/presentation/components/PlayerDetail";

export const usePlayerStats = (playerId: string | undefined) => {
  const playerStats = useMemo((): PlayerStats | null => {
    if (!playerId) return null;

    const performances: PlayerPerformance[] = [];
    const ownerMap = new Map<string, OwnerStats>();
    let highestScore = 0;
    let highestScoreGame: PlayerPerformance | null = null;
    let playoffGames = 0;
    let finalsAppearances = 0;
    let finalsWins = 0;

    // Iterate through all seasons
    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);
      const playoffWeekStart = getPlayoffWeekStart(seasonData);

      // Check if this season has matchup data
      if (seasonData.matchups) {
        Object.entries(seasonData.matchups).forEach(
          ([weekStr, weekMatchups]) => {
            const week = parseInt(weekStr);
            const isPlayoffWeekCheck = isPlayoffWeek(week, playoffWeekStart);

            weekMatchups.forEach((matchup) => {
              // Check if player was in this matchup by looking at players_points
              const playerPoints = matchup.players_points?.[playerId];
              if (playerPoints === undefined) return;

              // Find the roster this player was on for this matchup
              const roster = seasonData.rosters?.find(
                (r) => r.roster_id === matchup.roster_id
              );
              if (!roster) return;

              const wasStarted = matchup.starters?.includes(playerId) || false;
              const teamName = getTeamName(roster.owner_id, seasonData.users);

              // Find opponent - look for the other matchup with the same matchup_id but different roster_id
              const opponentMatchup = weekMatchups.find(
                (m) =>
                  m.matchup_id === matchup.matchup_id &&
                  m.roster_id !== matchup.roster_id
              );
              const opponent = opponentMatchup
                ? (() => {
                    const opponentRoster = seasonData.rosters?.find(
                      (r) => r.roster_id === opponentMatchup.roster_id
                    );
                    return opponentRoster
                      ? getTeamName(opponentRoster.owner_id, seasonData.users)
                      : "Unknown Team";
                  })()
                : "Unknown";

              // Use utility to determine if this is a meaningful playoff game
              const isMeaningfulPlayoff =
                isPlayoffWeekCheck &&
                isMeaningfulPlayoffGame(
                  matchup,
                  seasonData,
                  week,
                  playoffWeekStart
                );

              // Check if it's specifically a championship game (p: 1)
              let isChampionshipGame = false;
              if (isMeaningfulPlayoff && seasonData.winners_bracket) {
                const bracketMatch = seasonData.winners_bracket.find(
                  (bm) =>
                    (bm.t1 === matchup.roster_id ||
                      bm.t2 === matchup.roster_id) &&
                    bm.r === week - playoffWeekStart + 1
                );
                isChampionshipGame = !!(bracketMatch && bracketMatch.p === 1);
              }

              // Only add to performances if it's a meaningful playoff game or regular season
              if (isMeaningfulPlayoff || !isPlayoffWeekCheck) {
                const performance: PlayerPerformance = {
                  year,
                  week,
                  opponent,
                  points: playerPoints,
                  wasStarted,
                  matchupId: matchup.matchup_id,
                  ownerId: roster.owner_id,
                  teamName,
                  isByeWeek: playerPoints === 0 && !wasStarted,
                  isPlayoffGame: isMeaningfulPlayoff,
                  isChampionshipGame,
                };

                performances.push(performance);

                // Track highest score (only for non-excluded playoff games)
                if (playerPoints > highestScore) {
                  highestScore = playerPoints;
                  highestScoreGame = performance;
                }
              }

              // Track playoff/finals using utility function
              if (isMeaningfulPlayoff) {
                playoffGames++; // Count each playoff game, not just seasons

                // Check if it's specifically a championship game (p: 1)
                if (isChampionshipGame) {
                  finalsAppearances++;

                  // Check if this team won the matchup (compare roster totals, not individual player points)
                  if (
                    opponentMatchup &&
                    matchup.points > opponentMatchup.points
                  ) {
                    finalsWins++;
                  }
                }
              }

              // Update owner stats (only for meaningful playoff games or regular season)
              if (isMeaningfulPlayoff || !isPlayoffWeekCheck) {
                const existingOwner = ownerMap.get(roster.owner_id);
                if (existingOwner) {
                  existingOwner.gamesPlayed++;
                  // Only add points if player was started
                  if (wasStarted) {
                    existingOwner.totalPoints += playerPoints;
                    existingOwner.starts++;
                  } else if (playerPoints > 0) {
                    // Only count as bench if player scored points (exclude 0-point bench games)
                    existingOwner.bench++;
                  }
                  existingOwner.averagePoints =
                    existingOwner.totalPoints / existingOwner.gamesPlayed;
                } else {
                  ownerMap.set(roster.owner_id, {
                    ownerId: roster.owner_id,
                    teamName,
                    gamesPlayed: 1,
                    totalPoints: wasStarted ? playerPoints : 0,
                    averagePoints: wasStarted ? playerPoints : 0,
                    starts: wasStarted ? 1 : 0,
                    bench: wasStarted ? 0 : playerPoints > 0 ? 1 : 0,
                  });
                }
              }
            });
          }
        );
      }
    });

    // Sort performances by year, then week, then points (descending)
    performances.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.week !== b.week) return a.week - b.week;
      return b.points - a.points;
    });

    // Add bye week detection logic
    const performancesWithBye = performances.map((performance) => {
      // Only consider bench games (not started) with 0 points as potential bye weeks
      if (performance.wasStarted || performance.points > 0) {
        return {
          ...performance,
          isByeWeek: false,
        };
      }

      // Only consider weeks 4-14 as potential bye weeks (NFL bye weeks typically occur weeks 4-14)
      if (performance.week < 4 || performance.week > 14) {
        return {
          ...performance,
          isByeWeek: false,
        };
      }

      // Group bench 0-point games by year (weeks 4-14) to track bye weeks per year
      const yearPerformances = performances.filter(
        (p) =>
          p.year === performance.year &&
          !p.wasStarted &&
          p.points === 0 &&
          p.week >= 4 &&
          p.week <= 14
      );
      const isFirstZeroBenchInYear =
        yearPerformances.findIndex(
          (p) =>
            p.week === performance.week && p.ownerId === performance.ownerId
        ) === 0;

      return {
        ...performance,
        isByeWeek: isFirstZeroBenchInYear,
      };
    });

    // Recalculate owner stats with bye week logic
    const ownerMapWithBye = new Map<string, OwnerStats>();
    performancesWithBye.forEach((performance) => {
      if (!ownerMapWithBye.has(performance.ownerId)) {
        ownerMapWithBye.set(performance.ownerId, {
          ownerId: performance.ownerId,
          teamName: performance.teamName,
          gamesPlayed: 0,
          totalPoints: 0,
          averagePoints: 0,
          starts: 0,
          bench: 0,
        });
      }
      const ownerStats = ownerMapWithBye.get(performance.ownerId)!;
      // Only add points if player was started
      if (performance.wasStarted) {
        ownerStats.totalPoints += performance.points;
        ownerStats.starts++;
      } else if (!performance.wasStarted && !performance.isByeWeek) {
        ownerStats.bench++;
      }
    });

    // Update team names to current year team names for each owner
    const currentYearTeamNames = new Map<string, string>();
    ownerMapWithBye.forEach((ownerStats) => {
      // Get current year team name for this owner
      const currentYearData = seasons[CURRENT_YEAR];
      if (currentYearData?.users) {
        const currentTeamName = getTeamName(
          ownerStats.ownerId,
          currentYearData.users
        );
        currentYearTeamNames.set(ownerStats.ownerId, currentTeamName);
      }
    });

    // Update team names in ownerMapWithBye
    ownerMapWithBye.forEach((ownerStats) => {
      const currentTeamName = currentYearTeamNames.get(ownerStats.ownerId);
      if (currentTeamName) {
        ownerStats.teamName = currentTeamName;
      }
    });

    // Calculate averages for owner stats (games = starts + bench, average = points / starts only)
    const ownerStats = Array.from(ownerMapWithBye.values()).map((stats) => {
      const gamesPlayed = stats.starts + stats.bench;
      return {
        ...stats,
        gamesPlayed,
        averagePoints: stats.starts > 0 ? stats.totalPoints / stats.starts : 0,
      };
    });

    const totalStarts = performancesWithBye.filter((p) => p.wasStarted).length;
    // Only count bench games that are not bye weeks
    const totalBench = performancesWithBye.filter(
      (p) => !p.wasStarted && !p.isByeWeek
    ).length;
    const totalGames = totalStarts + totalBench;
    // Only include points from games where the player started
    const totalPoints = performancesWithBye
      .filter((p) => p.wasStarted)
      .reduce((sum, p) => sum + p.points, 0);
    const averagePoints = totalStarts > 0 ? totalPoints / totalStarts : 0;

    return {
      seasonsPlayed: new Set(performancesWithBye.map((p) => p.year)).size,
      totalGames,
      totalStarts,
      totalBench,
      totalPoints,
      averagePoints,
      highestScore,
      highestScoreGame,
      ownerStats: ownerStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed),
      performances: performancesWithBye.sort(
        (a, b) => b.year - a.year || b.week - a.week
      ),
      achievements: {
        playoffGames,
        finalsAppearances,
        finalsWins,
      },
    };
  }, [playerId]);

  return playerStats;
};
