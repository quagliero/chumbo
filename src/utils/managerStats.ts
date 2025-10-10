import { seasons, getPlayer } from "@/data";
import { YEARS } from "@/domain/constants";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";
import {
  getPlayoffWeekStart,
  isPlayoffWeek,
  isRegularSeasonWeek,
  isMeaningfulPlayoffGame,
} from "@/utils/playoffUtils";
import managers from "@/data/managers.json";
import { getManagerBySleeperOwnerId } from "@/utils/managerUtils";
import {
  getRosterPointsFor,
  getRosterPointsAgainst,
  determineMatchupResult,
  calculateLeagueRecord,
  sortTeamsByRecord,
} from "@/utils/recordUtils";
import { getPlayerPosition } from "@/utils/playerDataUtils";

export type DataMode = "regular" | "playoffs" | "combined";

export interface AllStarSlot {
  position: string;
  player?: {
    playerId: string;
    playerName: string;
    totalPoints: number;
    averagePoints: number;
    games: number;
  };
}

export interface MostDraftedPlayer {
  playerId: string;
  playerName: string;
  timesDrafted: number;
  years: number[];
  bestPick: {
    year: number;
    round: number;
    pick: number;
  };
}

export interface MostCappedPlayer {
  playerId: string;
  playerName: string;
  starts: number;
  years: number[];
  averageScore: number;
}

export interface TopPerformance {
  playerId: string;
  playerName: string;
  year: number;
  week: number;
  points: number;
  result: "W" | "L" | "T";
  opponentName: string;
  matchup_id: number;
}

export interface ManagerStats {
  managerId: string;
  managerName: string;
  teamName: string;

  // Overall records
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPointsFor: number;
  totalPointsAgainst: number;

  // League-wide performance (vs everyone each week)
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;

  // Per-season breakdown
  seasonStats: SeasonStats[];

  // H2H records against other managers
  h2hRecords: Record<string, ManagerH2HRecord>;

  // Achievements
  championships: number;
  runnerUps: number;
  thirdPlace: number;
  scoringCrowns: number;
  firstPlaceStandings: number;
  playoffs: number;

  // Best seasons
  bestWinsSeason: { year: number; wins: number };
  bestPointsSeason: { year: number; points: number };

  // Player stats
  allStarLineup: AllStarSlot[];
  mostDraftedPlayers: MostDraftedPlayer[];
  mostCappedPlayers: MostCappedPlayer[];
  topPerformances: TopPerformance[];
}

export interface SeasonStats {
  year: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  leagueWins: number;
  leagueLosses: number;
  leagueTies: number;
  finalStanding: number;
  pointsStanding: number;
  championshipResult?: "champion" | "runner-up" | "third-place";
  scoringCrown?: boolean;
  madePlayoffs?: boolean;
}

export interface ManagerH2HRecord {
  managerId: string;
  managerName: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  currentStreak: {
    type: "W" | "L" | "T";
    count: number;
  };
  mostRecent: {
    year: number;
    week: number;
    result: "W" | "L" | "T";
    pointsFor: number;
    pointsAgainst: number;
  } | null;
}

/**
 * Calculate comprehensive manager statistics
 */
export const getManagerStats = (
  managerId: string,
  dataMode: DataMode = "regular"
): ManagerStats | null => {
  const manager = managers.find((m) => m.id === managerId);
  if (!manager) return null;

  const seasonStats: SeasonStats[] = [];
  let totalWins = 0,
    totalLosses = 0,
    totalTies = 0;
  let totalPointsFor = 0,
    totalPointsAgainst = 0;
  let leagueWins = 0,
    leagueLosses = 0,
    leagueTies = 0;
  let championships = 0,
    runnerUps = 0,
    thirdPlace = 0;
  let scoringCrowns = 0,
    firstPlaceStandings = 0,
    playoffs = 0;

  const h2hRecords: Record<string, ManagerH2HRecord> = {};
  const h2hGames: Array<{
    opponentId: string;
    year: number;
    week: number;
    result: "W" | "L" | "T";
    pointsFor: number;
    pointsAgainst: number;
  }> = [];
  let bestWinsSeason = { year: 0, wins: 0 };
  let bestPointsSeason = { year: 0, points: 0 };

  // Process each season
  YEARS.forEach((year) => {
    const seasonData = seasons[year];
    if (!seasonData?.rosters || !seasonData?.matchups) return;

    const roster = seasonData.rosters.find(
      (r) => r.owner_id === manager.sleeper.id
    );
    if (!roster) return;

    const seasonStat = getSeasonStats(
      manager.sleeper.id,
      year,
      seasonData,
      dataMode
    );
    if (!seasonStat) return;

    seasonStats.push(seasonStat);

    // Use appropriate calculation based on data mode
    if (dataMode === "playoffs") {
      // For playoffs only, use calculated stats
      totalWins += seasonStat.wins;
      totalLosses += seasonStat.losses;
      totalTies += seasonStat.ties;
      totalPointsFor += seasonStat.pointsFor;
      totalPointsAgainst += seasonStat.pointsAgainst;
    } else if (dataMode === "regular") {
      // For regular season only, use roster settings totals (same as AllTimeTable)
      totalWins += roster.settings?.wins || 0;
      totalLosses += roster.settings?.losses || 0;
      totalTies += roster.settings?.ties || 0;

      const rosterPointsFor = getRosterPointsFor(roster);
      const rosterPointsAgainst = getRosterPointsAgainst(roster);

      totalPointsFor += rosterPointsFor;
      totalPointsAgainst += rosterPointsAgainst;
    } else {
      // For combined, calculate regular season + playoff stats separately
      const regularSeasonStats = getRegularSeasonStats(
        manager.sleeper.id,
        seasonData
      );
      const playoffStats = getPlayoffStats(manager.sleeper.id, seasonData);

      totalWins += regularSeasonStats.wins + playoffStats.wins;
      totalLosses += regularSeasonStats.losses + playoffStats.losses;
      totalTies += regularSeasonStats.ties + playoffStats.ties;
      totalPointsFor += regularSeasonStats.pointsFor + playoffStats.pointsFor;
      totalPointsAgainst +=
        regularSeasonStats.pointsAgainst + playoffStats.pointsAgainst;
    }
    leagueWins += seasonStat.leagueWins;
    leagueLosses += seasonStat.leagueLosses;
    leagueTies += seasonStat.leagueTies;

    // Track achievements
    if (seasonStat.championshipResult === "champion") championships++;
    if (seasonStat.championshipResult === "runner-up") runnerUps++;
    if (seasonStat.championshipResult === "third-place") thirdPlace++;
    if (seasonStat.scoringCrown) scoringCrowns++;
    if (seasonStat.finalStanding === 1) firstPlaceStandings++;

    // Count playoff appearances (years they made the playoffs)
    // Check if they played in winners_bracket (first round or had bye and played second round)
    if (seasonData.winners_bracket) {
      // Check if they played in round 1 (first round)
      const round1Match = seasonData.winners_bracket.find(
        (bm: BracketMatch) =>
          (bm.t1 === roster.roster_id || bm.t2 === roster.roster_id) &&
          bm.r === 1
      );

      // Check if they had a bye in round 1 and played in round 2
      const round2Match = seasonData.winners_bracket.find(
        (bm: BracketMatch) =>
          (bm.t1 === roster.roster_id || bm.t2 === roster.roster_id) &&
          bm.r === 2
      );

      // Count as playoff appearance if they played in round 1 OR had bye and played in round 2
      if (round1Match || round2Match) {
        playoffs++;
      }
    }

    // Track best seasons
    if (seasonStat.wins > bestWinsSeason.wins) {
      bestWinsSeason = { year, wins: seasonStat.wins };
    }
    if (seasonStat.pointsFor > bestPointsSeason.points) {
      bestPointsSeason = { year, points: seasonStat.pointsFor };
    }
  });

  // Calculate H2H records
  YEARS.forEach((year) => {
    const seasonData = seasons[year];
    if (!seasonData?.rosters || !seasonData?.matchups) return;

    const roster = seasonData.rosters.find(
      (r) => r.owner_id === manager.sleeper.id
    );
    if (!roster) return;

    calculateH2HForSeason(
      manager.sleeper.id,
      year,
      seasonData,
      h2hRecords,
      h2hGames,
      dataMode
    );
  });

  // Calculate averages and streaks for H2H records
  Object.values(h2hRecords).forEach((record) => {
    const totalGames = record.wins + record.losses + record.ties;
    if (totalGames > 0) {
      record.avgPointsFor = record.avgPointsFor / totalGames;
      record.avgPointsAgainst = record.avgPointsAgainst / totalGames;
    }

    // Get games for this opponent, sorted by year and week (most recent first)
    const opponentGames = h2hGames
      .filter((game) => game.opponentId === record.managerId)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week - a.week;
      });

    if (opponentGames.length > 0) {
      // Set most recent game
      const mostRecentGame = opponentGames[0];
      record.mostRecent = {
        year: mostRecentGame.year,
        week: mostRecentGame.week,
        result: mostRecentGame.result,
        pointsFor: mostRecentGame.pointsFor,
        pointsAgainst: mostRecentGame.pointsAgainst,
      };

      // Calculate current streak
      let streakCount = 1;
      const streakType = mostRecentGame.result;

      for (let i = 1; i < opponentGames.length; i++) {
        if (opponentGames[i].result === streakType) {
          streakCount++;
        } else {
          break;
        }
      }

      record.currentStreak = {
        type: streakType,
        count: streakCount,
      };
    }
  });

  // Calculate player stats
  const playerPerformances = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      totalPoints: number;
      games: number;
      allScores: Array<{
        score: number;
        year: number;
        week: number;
        result: string;
        opponentName: string;
        matchup_id: number;
      }>;
    }
  >();

  const draftHistory = new Map<
    string,
    Array<{ year: number; round: number; pick: number }>
  >();

  // Process all seasons to collect player data
  YEARS.forEach((year) => {
    const seasonData = seasons[year];
    if (!seasonData) return;

    const roster = seasonData.rosters.find(
      (r: ExtendedRoster) => r.owner_id === manager.sleeper.id
    );
    if (!roster) return;

    // Process matchups to collect player performances
    Object.keys(seasonData.matchups).forEach((weekKey) => {
      const weekNum = parseInt(weekKey);

      // Filter weeks based on data mode (same logic as season stats)
      const playoffWeekStart = getPlayoffWeekStart(seasonData);

      if (dataMode === "regular" && isPlayoffWeek(weekNum, playoffWeekStart))
        return; // Skip playoff weeks
      if (
        dataMode === "playoffs" &&
        isRegularSeasonWeek(weekNum, playoffWeekStart)
      )
        return; // Skip regular season weeks

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const weekMatchups = (seasonData.matchups as any)[weekKey];

      const teamMatchup = weekMatchups.find(
        (m: ExtendedMatchup) => m.roster_id === roster.roster_id
      );
      if (!teamMatchup) return;

      // For playoffs mode and combined mode, only include meaningful playoff games
      if (
        (dataMode === "playoffs" || dataMode === "combined") &&
        isPlayoffWeek(weekNum, playoffWeekStart)
      ) {
        if (
          !isMeaningfulPlayoffGame(
            teamMatchup,
            seasonData,
            weekNum,
            playoffWeekStart
          )
        )
          return;
      }

      // Find opponent matchup to determine result
      const opponentMatchup = weekMatchups.find(
        (m: ExtendedMatchup) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== roster.roster_id
      );

      let result = "T";
      if (opponentMatchup) {
        result = determineMatchupResult(
          teamMatchup.points,
          opponentMatchup.points
        );
      }

      // Process starters
      teamMatchup.starters.forEach((playerId: string, index: number) => {
        if (playerId === "0") return; // Skip empty slots

        const points = teamMatchup.starters_points[index] || 0;

        // Get player name using the shared getPlayer function
        const player = getPlayer(playerId, year);
        let playerName = playerId;

        if (player) {
          if (player.position === "DEF") {
            // For DST, combine first_name + last_name (e.g., "New England Patriots")
            playerName = `${player.first_name} ${player.last_name}`;
          } else {
            // For regular players, use full_name or construct from first/last name
            playerName =
              player.full_name ||
              (player.first_name && player.last_name
                ? `${player.first_name} ${player.last_name}`
                : playerId);
          }
        }

        // If still not found and it's a string name, use it directly
        if (
          playerName === playerId &&
          typeof playerId === "string" &&
          playerId.includes(" ")
        ) {
          playerName = playerId;
        }

        if (!playerPerformances.has(playerId)) {
          playerPerformances.set(playerId, {
            playerId,
            playerName,
            totalPoints: 0,
            games: 0,
            allScores: [],
          });
        }

        // Get opponent name
        let opponentName = "Unknown";
        if (opponentMatchup) {
          const opponentRoster = seasonData.rosters.find(
            (r: ExtendedRoster) => r.roster_id === opponentMatchup.roster_id
          );
          if (opponentRoster) {
            const opponentManager = getManagerBySleeperOwnerId(
              opponentRoster.owner_id
            );
            if (opponentManager) {
              opponentName =
                opponentManager.teamName ||
                opponentManager.sleeper.display_name ||
                "Unknown";
            }
          }
        }

        const playerData = playerPerformances.get(playerId)!;
        playerData.totalPoints += points;
        playerData.games++;
        playerData.allScores.push({
          score: points,
          year,
          week: weekNum,
          result,
          opponentName,
          matchup_id: teamMatchup.matchup_id,
        });
      });
    });

    // Process draft data
    if (seasonData.picks) {
      seasonData.picks.forEach((pick) => {
        if (pick.roster_id === roster.roster_id) {
          const playerId = pick.player_id;
          if (!draftHistory.has(playerId)) {
            draftHistory.set(playerId, []);
          }
          draftHistory.get(playerId)!.push({
            year,
            round: pick.round,
            pick: pick.draft_slot,
          });
        }
      });
    }
  });

  // Create All-Star lineup
  const allStarLineup: AllStarSlot[] = [
    { position: "QB" },
    { position: "RB" },
    { position: "RB" },
    { position: "WR" },
    { position: "WR" },
    { position: "TE" },
    { position: "FLEX" },
    { position: "K" },
    { position: "DEF" },
  ];

  // Helper function to get player position using utility
  const getPlayerPositionLocal = (playerId: string): string => {
    return getPlayerPosition(playerId);
  };

  // Fill All-Star lineup
  const usedPlayers = new Set<string>();

  allStarLineup.forEach((slot) => {
    const availablePlayers = Array.from(playerPerformances.values()).filter(
      (p) => {
        if (usedPlayers.has(p.playerId)) return false; // Skip already used players

        const position = getPlayerPositionLocal(p.playerId);
        if (slot.position === "FLEX") {
          return position === "RB" || position === "WR" || position === "TE";
        }
        return position === slot.position;
      }
    );

    if (availablePlayers.length > 0) {
      const bestPlayer = availablePlayers.reduce((best, current) =>
        current.totalPoints > best.totalPoints ? current : best
      );

      slot.player = {
        playerId: bestPlayer.playerId,
        playerName: bestPlayer.playerName,
        totalPoints: bestPlayer.totalPoints,
        averagePoints:
          bestPlayer.games > 0 ? bestPlayer.totalPoints / bestPlayer.games : 0,
        games: bestPlayer.games,
      };

      // Mark this player as used
      usedPlayers.add(bestPlayer.playerId);
    }
  });

  // Create most drafted players list
  const mostDraftedPlayers: MostDraftedPlayer[] = Array.from(
    draftHistory.entries()
  )
    .map(([playerId, picks]) => {
      const playerData = playerPerformances.get(playerId);
      let playerName = playerData?.playerName;

      // If player not found in performances, try to get name from getPlayer
      if (!playerName) {
        const player = getPlayer(playerId);
        if (player) {
          if (player.position === "DEF") {
            playerName = `${player.first_name} ${player.last_name}`;
          } else {
            playerName =
              player.full_name ||
              (player.first_name && player.last_name
                ? `${player.first_name} ${player.last_name}`
                : `Player ${playerId}`);
          }
        } else {
          playerName = `Player ${playerId}`;
        }
      }

      const bestPick = picks.reduce((best, current) =>
        current.round < best.round ||
        (current.round === best.round && current.pick < best.pick)
          ? current
          : best
      );

      return {
        playerId,
        playerName,
        timesDrafted: picks.length,
        years: [...new Set(picks.map((p) => p.year))].sort(),
        bestPick,
      };
    })
    .sort((a, b) => {
      // First sort by times drafted (descending)
      if (b.timesDrafted !== a.timesDrafted) {
        return b.timesDrafted - a.timesDrafted;
      }
      // If tied, sort by most recent year (descending)
      const aMostRecent = Math.max(...a.years);
      const bMostRecent = Math.max(...b.years);
      return bMostRecent - aMostRecent;
    });

  // Create most capped players list
  const mostCappedPlayers: MostCappedPlayer[] = Array.from(
    playerPerformances.values()
  )
    .map((player) => {
      // Count starts by counting all scores (since allScores only includes started games)
      const starts = player.allScores.length;
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        starts,
        years: [...new Set(player.allScores.map((score) => score.year))].sort(),
        averageScore: starts > 0 ? player.totalPoints / starts : 0, // Average points per start
      };
    })
    .filter((player) => player.starts > 0) // Only include players who started at least once
    .sort((a, b) => {
      // First sort by starts (descending)
      if (b.starts !== a.starts) {
        return b.starts - a.starts;
      }
      // If tied, sort by most recent year (descending)
      const aMostRecent = Math.max(...a.years);
      const bMostRecent = Math.max(...b.years);
      return bMostRecent - aMostRecent;
    });

  // Create top performances list
  const topPerformances: TopPerformance[] = Array.from(
    playerPerformances.values()
  )
    .flatMap((player) =>
      player.allScores.map((score) => ({
        playerId: player.playerId,
        playerName: player.playerName,
        year: score.year,
        week: score.week,
        points: score.score,
        result: score.result as "W" | "L" | "T",
        opponentName: score.opponentName,
        matchup_id: score.matchup_id,
      }))
    )
    .sort((a, b) => b.points - a.points);

  return {
    managerId,
    managerName: manager.name,
    teamName: manager.teamName,
    totalWins,
    totalLosses,
    totalTies,
    totalPointsFor,
    totalPointsAgainst,
    leagueWins,
    leagueLosses,
    leagueTies,
    seasonStats,
    h2hRecords,
    championships,
    runnerUps,
    thirdPlace,
    scoringCrowns,
    firstPlaceStandings,
    playoffs,
    bestWinsSeason,
    bestPointsSeason,
    allStarLineup,
    mostDraftedPlayers,
    mostCappedPlayers,
    topPerformances,
  };
};

/**
 * Calculate stats for a specific season
 */
const getSeasonStats = (
  managerId: string,
  year: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any,
  dataMode: DataMode = "regular"
): SeasonStats | null => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster) return null;

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;
  let leagueWins = 0,
    leagueLosses = 0,
    leagueTies = 0;

  // Calculate record based on data mode
  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Filter weeks based on data mode
    if (dataMode === "regular" && isPlayoffWeek(weekNum, playoffWeekStart))
      return; // Skip playoff weeks
    if (
      dataMode === "playoffs" &&
      isRegularSeasonWeek(weekNum, playoffWeekStart)
    )
      return; // Skip regular season weeks

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;

    // For playoffs mode, only include games that are in winners_bracket and are meaningful
    if (dataMode === "playoffs" && isPlayoffWeek(weekNum, playoffWeekStart)) {
      // Check if this matchup is meaningful using the utility function
      if (
        !isMeaningfulPlayoffGame(
          teamMatchup,
          seasonData,
          weekNum,
          playoffWeekStart
        )
      )
        return;
    }

    if (teamMatchup) {
      pointsFor += teamMatchup.points;

      // Find opponent
      const opponentMatchup = weekMatchups.find(
        (m: ExtendedMatchup) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== roster.roster_id
      );

      if (opponentMatchup) {
        pointsAgainst += opponentMatchup.points;

        const result = determineMatchupResult(
          teamMatchup.points,
          opponentMatchup.points
        );
        if (result === "W") wins++;
        else if (result === "L") losses++;
        else ties++;
      }

      // Calculate league-wide performance
      const leagueRecord = calculateLeagueRecord(teamMatchup, weekMatchups);
      leagueWins += leagueRecord.leagueWins;
      leagueLosses += leagueRecord.leagueLosses;
      leagueTies += leagueRecord.leagueTies;
    }
  });

  // Calculate final standing
  const standings = sortTeamsByRecord(
    seasonData.rosters.map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      wins: r.settings?.wins || 0,
      losses: r.settings?.losses || 0,
      ties: r.settings?.ties || 0,
      pointsFor: getRosterPointsFor(r),
    }))
  );

  const finalStanding =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standings.findIndex((s: any) => s.rosterId === roster.roster_id) + 1;

  // Calculate points standing (ranking by total points scored)
  const pointsStandings = seasonData.rosters
    .map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      pointsFor: getRosterPointsFor(r),
    }))
    .sort(
      (
        a: { rosterId: string; pointsFor: number },
        b: { rosterId: string; pointsFor: number }
      ) => b.pointsFor - a.pointsFor
    );

  const pointsStanding =
    pointsStandings.findIndex(
      (s: { rosterId: string; pointsFor: number }) =>
        s.rosterId === roster.roster_id
    ) + 1;

  // Check championship results
  let championshipResult: "champion" | "runner-up" | "third-place" | undefined;
  if (seasonData.winners_bracket) {
    const championship = seasonData.winners_bracket.find(
      (m: BracketMatch) => m.p === 1
    );
    const thirdPlace = seasonData.winners_bracket.find(
      (m: BracketMatch) => m.p === 2
    );

    if (championship?.w === roster.roster_id) championshipResult = "champion";
    else if (
      championship?.t1 === roster.roster_id ||
      championship?.t2 === roster.roster_id
    )
      championshipResult = "runner-up";
    else if (thirdPlace?.w === roster.roster_id)
      championshipResult = "third-place";
  }

  // Check scoring crown - team with highest total points
  const allTeamsByPoints = seasonData.rosters
    .map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      pointsFor: getRosterPointsFor(r),
    }))
    .sort(
      (
        a: { rosterId: string; pointsFor: number },
        b: { rosterId: string; pointsFor: number }
      ) => b.pointsFor - a.pointsFor
    );

  const scoringCrown = allTeamsByPoints[0]?.rosterId === roster.roster_id;

  // Check if they made the playoffs (played in round 1 or had bye and played in round 2)
  let madePlayoffs = false;
  if (seasonData.winners_bracket) {
    // Check if they played in round 1 (first round)
    const round1Match = seasonData.winners_bracket.find(
      (bm: BracketMatch) =>
        (bm.t1 === roster.roster_id || bm.t2 === roster.roster_id) && bm.r === 1
    );

    // Check if they had a bye in round 1 and played in round 2
    const round2Match = seasonData.winners_bracket.find(
      (bm: BracketMatch) =>
        (bm.t1 === roster.roster_id || bm.t2 === roster.roster_id) && bm.r === 2
    );

    // Count as playoff appearance if they played in round 1 OR had bye and played in round 2
    madePlayoffs = !!(round1Match || round2Match);
  }

  return {
    year,
    wins,
    losses,
    ties,
    pointsFor,
    pointsAgainst,
    leagueWins,
    leagueLosses,
    leagueTies,
    finalStanding,
    pointsStanding,
    championshipResult,
    scoringCrown,
    madePlayoffs,
  };
};

/**
 * Calculate regular season-only stats for a season
 */
const getRegularSeasonStats = (
  managerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any
) => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster)
    return { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Only include regular season weeks
    if (isPlayoffWeek(weekNum, playoffWeekStart)) return;

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;

    pointsFor += teamMatchup.points;

    // Find opponent
    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );

    if (opponentMatchup) {
      pointsAgainst += opponentMatchup.points;

      if (teamMatchup.points > opponentMatchup.points) wins++;
      else if (teamMatchup.points < opponentMatchup.points) losses++;
      else ties++;
    }
  });

  return { wins, losses, ties, pointsFor, pointsAgainst };
};

/**
 * Calculate playoff-only stats for a season
 */
const getPlayoffStats = (
  managerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any
) => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster)
    return { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  let wins = 0,
    losses = 0,
    ties = 0;
  let pointsFor = 0,
    pointsAgainst = 0;

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Only include playoff weeks
    if (isRegularSeasonWeek(weekNum, playoffWeekStart)) return;

    // Only include games that are in winners_bracket and are meaningful
    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (!teamMatchup) return;

    // Check if this matchup is meaningful using the utility function
    if (
      !isMeaningfulPlayoffGame(
        teamMatchup,
        seasonData,
        weekNum,
        playoffWeekStart
      )
    )
      return;

    pointsFor += teamMatchup.points;

    // Find opponent
    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );

    if (opponentMatchup) {
      pointsAgainst += opponentMatchup.points;

      if (teamMatchup.points > opponentMatchup.points) wins++;
      else if (teamMatchup.points < opponentMatchup.points) losses++;
      else ties++;
    }
  });

  return { wins, losses, ties, pointsFor, pointsAgainst };
};

/**
 * Calculate H2H records for a season
 *
 * Note: This function is separate from the H2H utilities in h2h.ts because it:
 * - Accumulates records across multiple seasons
 * - Supports different data modes (regular/playoffs/combined)
 * - Tracks streaks and recent game details
 * - Uses ManagerH2HRecord type structure
 *
 * The h2h.ts utilities are for single-season, matchup-focused calculations.
 */
const calculateH2HForSeason = (
  managerId: string,
  year: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seasonData: any,
  h2hRecords: Record<string, ManagerH2HRecord>,
  h2hGames: Array<{
    opponentId: string;
    year: number;
    week: number;
    result: "W" | "L" | "T";
    pointsFor: number;
    pointsAgainst: number;
  }>,
  dataMode: DataMode = "regular"
) => {
  const roster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.owner_id === managerId
  );
  if (!roster) return;

  const playoffWeekStart =
    seasonData.league?.settings?.playoff_week_start || 15;

  // Use year parameter to avoid warning
  console.debug(
    `Calculating H2H for ${managerId} in ${year}, dataMode: ${dataMode}`
  );

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    // Filter weeks based on data mode
    if (dataMode === "regular" && isPlayoffWeek(weekNum, playoffWeekStart))
      return; // Skip playoff weeks
    if (
      dataMode === "playoffs" &&
      isRegularSeasonWeek(weekNum, playoffWeekStart)
    )
      return; // Skip regular season weeks

    // For playoffs mode, only include games that are in winners_bracket and are meaningful
    if (dataMode === "playoffs" && isPlayoffWeek(weekNum, playoffWeekStart)) {
      const weekMatchups = seasonData.matchups[weekKey];
      const teamMatchup = weekMatchups.find(
        (m: ExtendedMatchup) => m.roster_id === roster.roster_id
      );

      if (!teamMatchup) return;

      // Check if this matchup is meaningful using the utility function
      if (
        !isMeaningfulPlayoffGame(
          teamMatchup,
          seasonData,
          weekNum,
          playoffWeekStart
        )
      )
        return;
    }

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );

    if (teamMatchup) {
      const opponentMatchup = weekMatchups.find(
        (m: ExtendedMatchup) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== roster.roster_id
      );

      if (opponentMatchup) {
        const opponentRoster = seasonData.rosters.find(
          (r: ExtendedRoster) => r.roster_id === opponentMatchup.roster_id
        );
        if (!opponentRoster) return;

        const opponentManager = getManagerBySleeperOwnerId(
          opponentRoster.owner_id
        );
        if (!opponentManager) return;

        const opponentId = opponentRoster.owner_id;

        if (!h2hRecords[opponentId]) {
          h2hRecords[opponentId] = {
            managerId: opponentId,
            managerName: opponentManager.name,
            teamName: opponentManager.teamName,
            wins: 0,
            losses: 0,
            ties: 0,
            avgPointsFor: 0,
            avgPointsAgainst: 0,
            currentStreak: { type: "W", count: 0 },
            mostRecent: null,
          };
        }

        const record = h2hRecords[opponentId];

        // Determine result
        let result: "W" | "L" | "T";
        if (teamMatchup.points > opponentMatchup.points) {
          record.wins++;
          result = "W";
        } else if (teamMatchup.points < opponentMatchup.points) {
          record.losses++;
          result = "L";
        } else {
          record.ties++;
          result = "T";
        }

        record.avgPointsFor += teamMatchup.points;
        record.avgPointsAgainst += opponentMatchup.points;

        // Store game for streak calculation
        h2hGames.push({
          opponentId,
          year,
          week: weekNum,
          result,
          pointsFor: teamMatchup.points,
          pointsAgainst: opponentMatchup.points,
        });
      }
    }
  });
};
