import { seasons, getPlayer } from "@/data";
import managers from "@/data/managers.json";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { getPlayoffWeekStart, isPlayoffWeek, isMeaningfulPlayoffGame } from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { PlayerScore, SortOrder } from "./types";

/**
 * Every individual player's score for a team — bench included, which is what
 * the "Started Only" filter is for — sorted, after the position and started
 * filters.
 *
 * @param selectedSeason - a year as a string, or "all-time".
 * @param selectedPosition - a position, or "all".
 * @param filterStartedOnly - `null` for no filter.
 */
export const getPlayerScores = (
  selectedSeason: string,
  sortOrder: SortOrder,
  selectedPosition: string,
  filterStartedOnly: boolean | null
): PlayerScore[] => {
  const allPlayerScores: PlayerScore[] = [];

  // Process each year
  Object.entries(seasons).forEach(([yearStr, seasonData]) => {
    const year = parseInt(yearStr);

    // Filter by selected season
    if (selectedSeason !== "all-time" && yearStr !== selectedSeason) {
      return;
    }

    if (!seasonData?.rosters || !seasonData?.matchups) return;

    const rosters = seasonData.rosters as ExtendedRoster[];
    const matchups = seasonData.matchups as {
      [key: string]: ExtendedMatchup[];
    };

    const playoffWeekStart = getPlayoffWeekStart(seasonData);

    // Process each week
    Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
      const week = parseInt(weekStr);

      // Skip incomplete weeks
      if (!isWeekCompleted(week, seasonData.league)) {
        return;
      }

      // Skip playoff weeks except for elimination/championship games
      if (isPlayoffWeek(week, playoffWeekStart)) {
        const hasMeaningfulPlayoffGame = weekMatchups.some((matchup) =>
          isMeaningfulPlayoffGame(matchup, seasonData, week, playoffWeekStart)
        );
        if (!hasMeaningfulPlayoffGame) return;
      }

      // Process each matchup in the week
      weekMatchups.forEach((matchup) => {
        const roster = rosters.find(
          (r) => r.roster_id === matchup.roster_id
        );
        if (!roster) return;

        // For playoff weeks, check if this specific matchup is meaningful

        // (the shared rule — the three TopScores modes each had their own copy)

        if (

          week >= playoffWeekStart &&

          !isMeaningfulPlayoffGame(matchup, seasonData, week, playoffWeekStart)

        )

          return;

        const manager = managers.find(
          (m) => m.sleeper.id === roster.owner_id
        );
        if (!manager) return;

        // Process each player in the matchup
        Object.entries(matchup.players_points || {}).forEach(
          ([playerId, points]) => {
            if (typeof points !== "number" || isNaN(points)) return;

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
              position: player.position || "UNK",
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

  // Apply filters for player-score mode
  let filteredScores = allPlayerScores;

  // Filter by position
  if (selectedPosition !== "all") {
    filteredScores = filteredScores.filter(
      (score) => score.position === selectedPosition
    );
  }

  // Filter by started status
  if (filterStartedOnly !== null) {
    filteredScores = filteredScores.filter(
      (score) => score.was_started === filterStartedOnly
    );
  }

  return filteredScores.sort((a, b) =>
    sortOrder === "high-to-low" ? b.score - a.score : a.score - b.score
  );
};
