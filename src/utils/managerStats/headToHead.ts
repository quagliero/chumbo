import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import {
  isMeaningfulPlayoffGame,
  isPlayoffWeek,
  isRegularSeasonWeek,
} from "@/utils/playoffUtils";
import { getManagerBySleeperOwnerId } from "@/utils/managerUtils";
import { determineMatchupResult } from "@/utils/recordUtils";
import type {
  DataMode,
  H2HGame,
  ManagerH2HRecord,
  SeasonData,
} from "./types";

/**
 * The manager's head-to-head records, accumulated a season at a time.
 *
 * `records` is keyed by the opponent's Sleeper owner id and is returned to
 * callers as-is, so its key order (first meeting, oldest season first) is part
 * of the output. While accumulating, `avgPointsFor` / `avgPointsAgainst` hold
 * running *totals*; `finaliseH2HRecords` divides them through at the end.
 */
export interface H2HAccumulator {
  records: Record<string, ManagerH2HRecord>;
  games: H2HGame[];
}

export const createH2HAccumulator = (): H2HAccumulator => ({
  records: {},
  games: [],
});

const emptyRecord = (
  opponentId: string,
  managerName: string,
  teamName: string
): ManagerH2HRecord => ({
  managerId: opponentId,
  managerName,
  teamName,
  wins: 0,
  losses: 0,
  ties: 0,
  avgPointsFor: 0,
  avgPointsAgainst: 0,
  currentStreak: { type: "W", count: 0 },
  mostRecent: null,
});

/**
 * Add one season's head-to-head games to the accumulator.
 *
 * Note: this is separate from the H2H utilities in h2h.ts because it:
 * - Accumulates records across multiple seasons
 * - Supports different data modes (regular/playoffs/combined)
 * - Tracks streaks and recent game details
 * - Uses ManagerH2HRecord type structure
 *
 * The h2h.ts utilities are for single-season, matchup-focused calculations.
 */
export const collectSeasonH2H = (
  roster: ExtendedRoster,
  year: number,
  seasonData: SeasonData,
  accumulator: H2HAccumulator,
  dataMode: DataMode = "regular"
): void => {
  // Deliberately not `getPlayoffWeekStart(seasonData)`: the original read the
  // setting directly here, and the two differ for a season with no league
  // settings at all (both fall back to 15, so they agree in practice).
  const playoffWeekStart =
    seasonData.league?.settings?.playoff_week_start || 15;

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

    // For playoffs mode, only include games that are in winners_bracket and are
    // meaningful (i.e. not consolation).
    if (
      dataMode === "playoffs" &&
      isPlayoffWeek(weekNum, playoffWeekStart) &&
      !isMeaningfulPlayoffGame(
        teamMatchup,
        seasonData,
        weekNum,
        playoffWeekStart
      )
    )
      return;

    const opponentMatchup = weekMatchups.find(
      (m: ExtendedMatchup) =>
        m.matchup_id === teamMatchup.matchup_id &&
        m.roster_id !== roster.roster_id
    );
    if (!opponentMatchup) return;

    const opponentRoster = seasonData.rosters.find(
      (r: ExtendedRoster) => r.roster_id === opponentMatchup.roster_id
    );
    if (!opponentRoster) return;

    const opponentManager = getManagerBySleeperOwnerId(opponentRoster.owner_id);
    if (!opponentManager) return;

    const opponentId: string = opponentRoster.owner_id;

    if (!accumulator.records[opponentId]) {
      accumulator.records[opponentId] = emptyRecord(
        opponentId,
        opponentManager.name,
        opponentManager.teamName
      );
    }

    const record = accumulator.records[opponentId];
    const result = determineMatchupResult(
      teamMatchup.points,
      opponentMatchup.points
    );

    if (result === "W") record.wins++;
    else if (result === "L") record.losses++;
    else record.ties++;

    // Running totals; divided through by `finaliseH2HRecords`.
    record.avgPointsFor += teamMatchup.points;
    record.avgPointsAgainst += opponentMatchup.points;

    accumulator.games.push({
      opponentId,
      year,
      week: weekNum,
      result,
      pointsFor: teamMatchup.points,
      pointsAgainst: opponentMatchup.points,
    });
  });
};

/**
 * Turn the accumulated totals into averages, and derive the most recent meeting
 * and the current streak for each opponent.
 */
export const finaliseH2HRecords = ({
  records,
  games,
}: H2HAccumulator): Record<string, ManagerH2HRecord> => {
  Object.values(records).forEach((record) => {
    const totalGames = record.wins + record.losses + record.ties;
    if (totalGames > 0) {
      record.avgPointsFor = record.avgPointsFor / totalGames;
      record.avgPointsAgainst = record.avgPointsAgainst / totalGames;
    }

    // Games against this opponent, most recent first.
    const opponentGames = games
      .filter((game) => game.opponentId === record.managerId)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week - a.week;
      });

    if (opponentGames.length === 0) return;

    const mostRecentGame = opponentGames[0];
    record.mostRecent = {
      year: mostRecentGame.year,
      week: mostRecentGame.week,
      result: mostRecentGame.result,
      pointsFor: mostRecentGame.pointsFor,
      pointsAgainst: mostRecentGame.pointsAgainst,
    };

    // How far back the most recent result runs unbroken.
    const streakType = mostRecentGame.result;
    let streakCount = 1;
    for (let i = 1; i < opponentGames.length; i++) {
      if (opponentGames[i].result !== streakType) break;
      streakCount++;
    }

    record.currentStreak = { type: streakType, count: streakCount };
  });

  return records;
};
