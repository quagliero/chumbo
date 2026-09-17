import { CURRENT_YEAR } from "@/domain/constants";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedPick } from "@/types/pick";
import { ExtendedRoster } from "@/types/roster";
import {
  getPlayoffWeekStart,
  isMeaningfulPlayoffGame,
  isPlayoffWeek,
  isRegularSeasonWeek,
} from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { getManagerBySleeperOwnerId } from "@/utils/managerUtils";
import { determineMatchupResult } from "@/utils/recordUtils";
import { resolvePlayerName } from "./playerNames";
import type { DataMode, PlayerHistory, SeasonData } from "./types";

export const createPlayerHistory = (): PlayerHistory => ({
  playerPerformances: new Map(),
  draftHistory: new Map(),
});

/** The opponent's team name for a week, as the performance lists display it. */
const getOpponentName = (
  seasonData: SeasonData,
  opponentMatchup: ExtendedMatchup | undefined
): string => {
  if (!opponentMatchup) return "Unknown";

  const opponentRoster = seasonData.rosters.find(
    (r: ExtendedRoster) => r.roster_id === opponentMatchup.roster_id
  );
  if (!opponentRoster) return "Unknown";

  const opponentManager = getManagerBySleeperOwnerId(opponentRoster.owner_id);
  if (!opponentManager) return "Unknown";

  return (
    opponentManager.teamName || opponentManager.sleeper.display_name || "Unknown"
  );
};

/** Should this week count towards the player history, in this data mode? */
const includeWeek = (
  weekNum: number,
  year: number,
  seasonData: SeasonData,
  playoffWeekStart: number,
  dataMode: DataMode
): boolean => {
  const isPlayoff = isPlayoffWeek(weekNum, playoffWeekStart);

  // Only completed regular season weeks count. Historical seasons are all
  // complete by definition, so this only bites the season in progress.
  if (
    !isPlayoff &&
    year === CURRENT_YEAR &&
    !isWeekCompleted(weekNum, seasonData.league)
  ) {
    return false;
  }

  if (dataMode === "regular" && isPlayoff) return false;
  if (dataMode === "playoffs" && isRegularSeasonWeek(weekNum, playoffWeekStart))
    return false;

  return true;
};

/** Record every start the manager gave a player in one week. */
const collectWeekStarters = (
  teamMatchup: ExtendedMatchup,
  opponentMatchup: ExtendedMatchup | undefined,
  year: number,
  weekNum: number,
  seasonData: SeasonData,
  playerPerformances: PlayerHistory["playerPerformances"]
): void => {
  const result = opponentMatchup
    ? determineMatchupResult(teamMatchup.points, opponentMatchup.points)
    : "T";
  const opponentName = getOpponentName(seasonData, opponentMatchup);

  teamMatchup.starters.forEach((playerId: string, index: number) => {
    if (playerId === "0") return; // Skip empty slots

    const points = teamMatchup.starters_points[index] || 0;

    if (!playerPerformances.has(playerId)) {
      playerPerformances.set(playerId, {
        playerId,
        // Falls back to the raw id, which for the oldest seasons is sometimes
        // the player's name already.
        playerName: resolvePlayerName(playerId, year, playerId),
        totalPoints: 0,
        games: 0,
        allScores: [],
      });
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
};

/** Record the picks the manager used in one season's draft. */
const collectDraftPicks = (
  roster: ExtendedRoster,
  year: number,
  seasonData: SeasonData,
  draftHistory: PlayerHistory["draftHistory"]
): void => {
  if (!seasonData.picks) return;

  seasonData.picks.forEach((pick: ExtendedPick) => {
    if (pick.roster_id !== roster.roster_id) return;

    const entry = { year, round: pick.round, pick: pick.draft_slot };
    const existing = draftHistory.get(pick.player_id);

    if (existing) existing.push(entry);
    else draftHistory.set(pick.player_id, [entry]);
  });
};

/**
 * Add one season to the manager's player history: every lineup they started and
 * every pick they made.
 *
 * Note the week filter here is *not* the same as the one `getSeasonStats` uses —
 * it matches `usePlayerStats.ts` instead, so that the All-Star lineup counts
 * meaningful playoff games.
 */
export const collectSeasonPlayerHistory = (
  roster: ExtendedRoster,
  year: number,
  seasonData: SeasonData,
  dataMode: DataMode,
  { playerPerformances, draftHistory }: PlayerHistory
): void => {
  const playoffWeekStart = getPlayoffWeekStart(seasonData);

  Object.keys(seasonData.matchups).forEach((weekKey) => {
    const weekNum = parseInt(weekKey);

    if (!includeWeek(weekNum, year, seasonData, playoffWeekStart, dataMode))
      return;

    const weekMatchups = seasonData.matchups[weekKey];
    const teamMatchup = weekMatchups.find(
      (m: ExtendedMatchup) => m.roster_id === roster.roster_id
    );
    if (!teamMatchup) return;

    // For playoffs and combined, only meaningful playoff games count.
    if (
      (dataMode === "playoffs" || dataMode === "combined") &&
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

    collectWeekStarters(
      teamMatchup,
      opponentMatchup,
      year,
      weekNum,
      seasonData,
      playerPerformances
    );

  });

  // A draft happens once a season, before a single game is played, so it is not
  // a regular-season or a playoff fact and must not inherit the week filter.
  // The original implementation collected picks inside the week loop, so a
  // season contributed nothing unless one of its weeks qualified: in "playoffs"
  // mode a manager who missed the playoffs lost that entire draft. fin dropped
  // from 175 drafted players to 28, kitch from 194 to 57. Collected once per
  // season now, regardless of mode (H11).
  collectDraftPicks(roster, year, seasonData, draftHistory);
};
