import { seasons } from "@/data";
import { memoiseOverSeasons } from "@/utils/cache";
import { YEARS } from "@/domain/constants";
import managers from "@/data/managers.json";
import { buildAllStarLineup } from "./allStarLineup";
import {
  collectSeasonH2H,
  createH2HAccumulator,
  finaliseH2HRecords,
} from "./headToHead";
import {
  collectSeasonPlayerHistory,
  createPlayerHistory,
} from "./playerHistory";
import {
  buildMostCappedPlayers,
  buildMostDraftedPlayers,
  buildTopPerformances,
} from "./playerLists";
import {
  findManagerRoster,
  getSeasonStats,
  getSeasonTotals,
} from "./seasonRecords";
import type { DataMode, ManagerStats, SeasonStats } from "./types";

export type {
  AllStarSlot,
  DataMode,
  ManagerH2HRecord,
  ManagerStats,
  MostCappedPlayer,
  MostDraftedPlayer,
  SeasonStats,
  TopPerformance,
} from "./types";

/**
 * Calculate comprehensive manager statistics.
 *
 * One pass over the seasons, with three concerns applied to each in turn:
 * the season record (`seasonRecords`), the head-to-head ledger (`headToHead`)
 * and the player history the lineup and draft lists are derived from
 * (`playerHistory`). The derived lists are built once, at the end.
 */
const computeManagerStats = (
  managerId: string,
  dataMode: DataMode
): ManagerStats | null => {
  const manager = managers.find((m) => m.id === managerId);
  if (!manager) return null;

  const sleeperId = manager.sleeper.id;

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
  let bestWinsSeason = { year: 0, wins: 0 };
  let bestPointsSeason = { year: 0, points: 0 };

  const h2h = createH2HAccumulator();
  const playerHistory = createPlayerHistory();

  YEARS.forEach((year) => {
    const seasonData = seasons[year];
    if (!seasonData?.rosters || !seasonData?.matchups) return;

    const roster = findManagerRoster(seasonData, sleeperId);
    if (!roster) return;

    // --- Season record -----------------------------------------------------
    const seasonStat = getSeasonStats(sleeperId, year, seasonData, dataMode);
    if (!seasonStat) return;

    seasonStats.push(seasonStat);

    const totals = getSeasonTotals(roster, seasonData, seasonStat, dataMode);
    totalWins += totals.wins;
    totalLosses += totals.losses;
    totalTies += totals.ties;
    totalPointsFor += totals.pointsFor;
    totalPointsAgainst += totals.pointsAgainst;

    leagueWins += seasonStat.leagueWins;
    leagueLosses += seasonStat.leagueLosses;
    leagueTies += seasonStat.leagueTies;

    // --- Achievements ------------------------------------------------------
    if (seasonStat.championshipResult === "champion") championships++;
    if (seasonStat.championshipResult === "runner-up") runnerUps++;
    if (seasonStat.championshipResult === "third-place") thirdPlace++;
    if (seasonStat.scoringCrown) scoringCrowns++;
    if (seasonStat.finalStanding === 1) firstPlaceStandings++;
    if (seasonStat.madePlayoffs) playoffs++;

    if (seasonStat.wins > bestWinsSeason.wins) {
      bestWinsSeason = { year, wins: seasonStat.wins };
    }
    if (seasonStat.pointsFor > bestPointsSeason.points) {
      bestPointsSeason = { year, points: seasonStat.pointsFor };
    }

    // --- Head to head ------------------------------------------------------
    collectSeasonH2H(roster, year, seasonData, h2h, dataMode);

    // --- Players -----------------------------------------------------------
    collectSeasonPlayerHistory(
      roster,
      year,
      seasonData,
      dataMode,
      playerHistory
    );
  });

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
    h2hRecords: finaliseH2HRecords(h2h),
    championships,
    runnerUps,
    thirdPlace,
    scoringCrowns,
    firstPlaceStandings,
    playoffs,
    bestWinsSeason,
    bestPointsSeason,
    allStarLineup: buildAllStarLineup(playerHistory),
    mostDraftedPlayers: buildMostDraftedPlayers(playerHistory),
    mostCappedPlayers: buildMostCappedPlayers(playerHistory),
    topPerformances: buildTopPerformances(playerHistory),
  };
};

/**
 * A manager's full career stats. Memoised: this walks every season, and the
 * manager pages call it repeatedly as you move between managers and modes.
 */
const memoisedManagerStats = memoiseOverSeasons(
  "getManagerStats",
  computeManagerStats,
  // The Managers page asks for every manager in one pass, so this has to hold
  // at least that many or it evicts faster than it is read — measured at 12,
  // a 17-manager sweep went 49ms cold to 34ms warm, i.e. almost no benefit.
  // 20 covers the full league plus a little headroom. Entries are large
  // (~300 KB), so this is the one cache where the bound costs real memory.
  20
);

export const getManagerStats = (
  managerId: string,
  dataMode: DataMode = "regular"
): ManagerStats | null => memoisedManagerStats(managerId, dataMode);
