import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { getPlayoffWeekStart, isMeaningfulPlayoffGame } from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { MatchTotal, SortOrder } from "./types";

/**
 * Every game's combined score, both teams together, sorted. The same playoff
 * rule as the team and player scores: `isMeaningfulPlayoffGame`.
 *
 * @param selectedSeason - a year as a string, or "all-time".
 */
export const getMatchTotals = (
  selectedSeason: string,
  sortOrder: SortOrder
): MatchTotal[] => {
  const allMatchTotals: MatchTotal[] = [];

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
      if (week >= playoffWeekStart) {
        const hasMeaningfulPlayoffGame = weekMatchups.some((matchup) =>
          isMeaningfulPlayoffGame(matchup, seasonData, week, playoffWeekStart)
        );
        if (!hasMeaningfulPlayoffGame) return;
      }

      // Group matchups by matchup_id to get pairs
      const matchupGroups = new Map<number, ExtendedMatchup[]>();
      weekMatchups.forEach((matchup) => {
        // No opponent (an eliminated team's playoff-week lineup): not a game,
        // and two of them must not be paired as one.
        if (matchup.matchup_id == null) return;
        if (!matchupGroups.has(matchup.matchup_id)) {
          matchupGroups.set(matchup.matchup_id, []);
        }
        matchupGroups.get(matchup.matchup_id)!.push(matchup);
      });

      // Process each matchup pair
      matchupGroups.forEach((matchupPair) => {
        if (matchupPair.length !== 2) return; // Skip incomplete matchups

        const [team1, team2] = matchupPair;

        // The shared rule, as the other two modes use: an elimination game or
        // the final, judged by this week's round. It used to be a third copy,
        // with its own extra losers-bracket test — redundant, since a team in
        // the losers bracket is never in a winners-bracket game that week.
        if (
          week >= playoffWeekStart &&
          !isMeaningfulPlayoffGame(team1, seasonData, week, playoffWeekStart)
        )
          return;

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
};
