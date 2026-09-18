import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { isWeekCompleted } from "@/utils/weekUtils";
import { SortOrder, TopScore } from "./types";
import { getPlayoffWeekStart, isMeaningfulPlayoffGame } from "@/utils/playoffUtils";

/**
 * Every team score in the archive (or in one season), sorted. Regular-season
 * weeks, plus the playoff games that could end a season — eliminations and the
 * final — but not the consolation games.
 *
 * @param selectedSeason - a year as a string, or "all-time".
 */
export const getTeamScores = (
  selectedSeason: string,
  sortOrder: SortOrder
): TopScore[] => {
  const allScores: TopScore[] = [];

  // Process each year
  Object.entries(seasons).forEach(([yearStr, seasonData]) => {
    const year = parseInt(yearStr);

    // Filter by selected season
    if (selectedSeason !== "all-time" && yearStr !== selectedSeason) {
      return;
    }

    if (!seasonData?.rosters || !seasonData?.matchups || !seasonData?.users)
      return;

    const rosters = seasonData.rosters as ExtendedRoster[];
    const matchups = seasonData.matchups as {
      [key: string]: ExtendedMatchup[];
    };

    // Get playoff week start to filter out playoff games
    const playoffWeekStart = getPlayoffWeekStart(seasonData);

    // Process each week
    Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
      const week = parseInt(weekStr);

      // Skip incomplete weeks
      if (!isWeekCompleted(week, seasonData.league)) {
        return;
      }

      // Skip playoff weeks except for elimination/championship games
      if (week >= playoffWeekStart) {
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
};
