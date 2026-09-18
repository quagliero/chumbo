import { seasons, getPlayer } from "@/data";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { BracketMatch } from "@/types/bracket";
import { Manager } from "@/types/manager";
import {
  getPlayoffWeekStart,
  isPlayoffWeek,
  isRegularSeasonWeek,
} from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { ValidYear } from "@/domain/constants";

export interface H2HMatchup {
  year: number;
  week: number;
  matchupId: string | null;
  managerAPoints: number;
  managerBPoints: number;
  result: "W" | "L" | "T";
  isPlayoff: boolean;
}

/** One starter's score in one game between the two, from his manager's side. */
export type PlayerGameScore = {
  score: number;
  year: number;
  week: number;
  result: string;
  playerId: string;
  /** For display. Never a key — see where the scores are collected. */
  playerName: string;
};

/**
 * Every completed game the two managers played against each other, and every
 * starter who scored in those games, in one pass over the archive.
 *
 * The first half of what was the page's `useMemo`, moved as it was. It stays a
 * single pass: the player-score maps fill regular season then playoffs, season
 * by season, and the stable sorts in `summariseH2H` break ties among equal
 * scores by that order, so two passes would reorder them.
 */
export const collectH2HGames = (managerAData: Manager, managerBData: Manager) => {
  const regularSeasonMatchups: H2HMatchup[] = [];
  const playoffMatchups: H2HMatchup[] = [];

  // Player scores per manager, keyed by player id
  const managerAPlayerScores: Map<
    string,
    Array<{
      score: number;
      year: number;
      week: number;
      result: string;
      playerId: string;
      playerName: string;
    }>
  > = new Map();
  const managerBPlayerScores: Map<
    string,
    Array<{
      score: number;
      year: number;
      week: number;
      result: string;
      playerId: string;
      playerName: string;
    }>
  > = new Map();

  // Process all seasons
  Object.entries(seasons).forEach(([yearStr, seasonData]) => {
    const year = parseInt(yearStr) as ValidYear;

    // Find rosters for both managers (using sleeper IDs)
    const managerARoster = seasonData.rosters.find(
      (r: ExtendedRoster) => r.owner_id === managerAData.sleeper.id
    );
    const managerBRoster = seasonData.rosters.find(
      (r: ExtendedRoster) => r.owner_id === managerBData.sleeper.id
    );

    if (!managerARoster || !managerBRoster) return;

    // Get playoff week start for this season
    const playoffWeekStart = getPlayoffWeekStart(seasonData);

    // Process regular season matchups

    if (seasonData.matchups) {
      Object.entries(seasonData.matchups).forEach(
        ([weekStr, weekMatchups]) => {
          const week = parseInt(weekStr);

          // Skip incomplete weeks
          if (!isWeekCompleted(week, seasonData.league)) {
            return;
          }

          // Skip playoff weeks for regular season matchups
          if (isPlayoffWeek(week, playoffWeekStart)) return;

          // Find matchups between the two managers (avoid duplicates)
          const processedMatchupIds = new Set<string>();

          weekMatchups.forEach((matchup: ExtendedMatchup) => {
            if (matchup.matchup_id === null) return;
            if (processedMatchupIds.has(matchup.matchup_id.toString()))
              return;

            const managerAMatchup =
              matchup.roster_id === managerARoster.roster_id
                ? matchup
                : weekMatchups.find(
                    (m: ExtendedMatchup) =>
                      m.matchup_id === matchup.matchup_id &&
                      m.roster_id === managerARoster.roster_id
                  );
            const managerBMatchup =
              matchup.roster_id === managerBRoster.roster_id
                ? matchup
                : weekMatchups.find(
                    (m: ExtendedMatchup) =>
                      m.matchup_id === matchup.matchup_id &&
                      m.roster_id === managerBRoster.roster_id
                  );

            if (!managerAMatchup || !managerBMatchup) return;

            // Mark this matchup as processed
            processedMatchupIds.add(matchup.matchup_id.toString());

            const h2hMatchup: H2HMatchup = {
              year,
              week,
              matchupId: matchup.matchup_id?.toString() || null,
              managerAPoints: managerAMatchup.points,
              managerBPoints: managerBMatchup.points,
              result:
                managerAMatchup.points > managerBMatchup.points
                  ? "W"
                  : managerAMatchup.points < managerBMatchup.points
                  ? "L"
                  : "T",
              isPlayoff: false,
            };

            regularSeasonMatchups.push(h2hMatchup);

            // Track player scores for both managers (only in this specific matchup)
            [managerAMatchup, managerBMatchup].forEach(
              (matchup, managerIndex) => {
                const currentPlayerScores =
                  managerIndex === 0
                    ? managerAPlayerScores
                    : managerBPlayerScores;

                if (matchup.starters_points && matchup.starters) {
                  // Map starter positions to player IDs
                  matchup.starters.forEach((playerId, index) => {
                    // Skip empty starter slots (playerId is 0)
                    if (playerId === "0") {
                      return;
                    }

                    const points = matchup.starters_points?.[index];
                    const pointsNum = typeof points === "number" ? points : 0;
                    if (pointsNum > 0) {
                      // Check if this is a string-named player (like "Danario Alexander")
                      const isStringNamedPlayer =
                        typeof playerId === "string" &&
                        playerId.includes(" ");

                      const player = isStringNamedPlayer
                        ? null
                        : getPlayer(playerId.toString(), year);
                      const playerName = player
                        ? `${player.first_name} ${player.last_name}`
                        : playerId.toString(); // Use the ID as the name for string-named players

                      // Keyed by id, not name: two players can share a name
                      // (see scripts/fix-player-ids.js), and keying on it merged
                      // their games into one line on the All-Stars and best-games
                      // lists. The name rides along for display only.
                      const scoreKey = playerId.toString();
                      if (!currentPlayerScores.has(scoreKey)) {
                        currentPlayerScores.set(scoreKey, []);
                      }
                      const result =
                        managerAMatchup.points > managerBMatchup.points
                          ? managerIndex === 0
                            ? "W"
                            : "L"
                          : managerAMatchup.points < managerBMatchup.points
                          ? managerIndex === 0
                            ? "L"
                            : "W"
                          : "T";

                      currentPlayerScores.get(scoreKey)!.push({
                        score: pointsNum,
                        year,
                        week,
                        result,
                        playerId: scoreKey,
                        playerName,
                      });
                    }
                  });
                }
              }
            );
          });
        }
      );
    }

    // Process playoff matchups (from matchup data, not bracket)

    if (seasonData.matchups) {
      Object.entries(seasonData.matchups).forEach(
        ([weekStr, weekMatchups]) => {
          const week = parseInt(weekStr);

          // Skip incomplete weeks
          if (!isWeekCompleted(week, seasonData.league)) {
            return;
          }

          // Only include playoff weeks
          if (isRegularSeasonWeek(week, playoffWeekStart)) return;

          // Find playoff matchups between the two managers (avoid duplicates)
          const processedPlayoffMatchupIds = new Set<string>();

          weekMatchups.forEach((matchup: ExtendedMatchup) => {
            if (matchup.matchup_id === null) return;
            if (processedPlayoffMatchupIds.has(matchup.matchup_id.toString()))
              return;

            const managerAMatchup =
              matchup.roster_id === managerARoster.roster_id
                ? matchup
                : weekMatchups.find(
                    (m: ExtendedMatchup) =>
                      m.matchup_id === matchup.matchup_id &&
                      m.roster_id === managerARoster.roster_id
                  );
            const managerBMatchup =
              matchup.roster_id === managerBRoster.roster_id
                ? matchup
                : weekMatchups.find(
                    (m: ExtendedMatchup) =>
                      m.matchup_id === matchup.matchup_id &&
                      m.roster_id === managerBRoster.roster_id
                  );

            if (!managerAMatchup || !managerBMatchup) return;

            // Check if this is a meaningful playoff game (elimination/championship only)
            // Must find a bracket match where these two specific teams are paired together
            // Exclude consolation games (3rd place, 5th place, etc.) which have 'p' property
            //
            // IN THIS WEEK'S ROUND. Without the round, `find` returned the pair's
            // first bracket game of the season, so two teams who met in a semi and
            // again in the third-place game had the consolation week judged by the
            // semi — no `p`, so "meaningful" — and counted as a second playoff
            // meeting. Same week-to-round rule as `isMeaningfulPlayoffGame`.
            const round = week - playoffWeekStart + 1;
            const meaningfulBracketMatch = seasonData.winners_bracket?.find(
              (bm: BracketMatch) => {
                const teamAMatch =
                  bm.t1 === managerARoster.roster_id ||
                  bm.t2 === managerARoster.roster_id;
                const teamBMatch =
                  bm.t1 === managerBRoster.roster_id ||
                  bm.t2 === managerBRoster.roster_id;
                return bm.r === round && teamAMatch && teamBMatch;
              }
            );

            // Only include if it's an elimination/championship game
            // Include championship (p.1) but exclude consolation games (p.3, p.5, etc.)
            const isMeaningfulPlayoff =
              meaningfulBracketMatch &&
              (!meaningfulBracketMatch.p || meaningfulBracketMatch.p === 1);

            if (isMeaningfulPlayoff) {
              // Mark this matchup as processed
              processedPlayoffMatchupIds.add(matchup.matchup_id.toString());

              playoffMatchups.push({
                year,
                week,
                matchupId: matchup.matchup_id?.toString() || null,
                managerAPoints: managerAMatchup.points,
                managerBPoints: managerBMatchup.points,
                result:
                  managerAMatchup.points > managerBMatchup.points
                    ? "W"
                    : managerAMatchup.points < managerBMatchup.points
                    ? "L"
                    : "T",
                isPlayoff: true,
              });

              // Track player scores for playoff matchups too
              [managerAMatchup, managerBMatchup].forEach(
                (matchup, managerIndex) => {
                  const currentPlayerScores =
                    managerIndex === 0
                      ? managerAPlayerScores
                      : managerBPlayerScores;

                  if (matchup.starters_points && matchup.starters) {
                    // Map starter positions to player IDs
                    matchup.starters.forEach((playerId, playerIndex) => {
                      // Skip empty starter slots (playerId is 0)
                      if (playerId === "0") {
                        return;
                      }

                      const points = matchup.starters_points?.[playerIndex];
                      const pointsNum =
                        typeof points === "number" ? points : 0;
                      if (pointsNum > 0) {
                        // Check if this is a string-named player (like "Danario Alexander")
                        const isStringNamedPlayer =
                          typeof playerId === "string" &&
                          playerId.includes(" ");

                        const player = isStringNamedPlayer
                          ? null
                          : getPlayer(playerId.toString(), year);
                        const playerName = player
                          ? `${player.first_name} ${player.last_name}`
                          : playerId.toString(); // Use the ID as the name for string-named players

                        // Keyed by id, not name: two players can share a name
                        // (see scripts/fix-player-ids.js), and keying on it merged
                        // their games into one line on the All-Stars and best-games
                        // lists. The name rides along for display only.
                        const scoreKey = playerId.toString();
                        if (!currentPlayerScores.has(scoreKey)) {
                          currentPlayerScores.set(scoreKey, []);
                        }
                        const result =
                          managerAMatchup.points > managerBMatchup.points
                            ? managerIndex === 0
                              ? "W"
                              : "L"
                            : managerAMatchup.points < managerBMatchup.points
                            ? managerIndex === 0
                              ? "L"
                              : "W"
                            : "T";

                        currentPlayerScores.get(scoreKey)!.push({
                          score: pointsNum,
                          year,
                          week,
                          result,
                          playerId: scoreKey,
                          playerName,
                        });
                      }
                    });
                  }
                }
              );
            }
          });
        }
      );
    }
  });

  return {
    regularSeasonMatchups,
    playoffMatchups,
    managerAPlayerScores,
    managerBPlayerScores,
  };
};
