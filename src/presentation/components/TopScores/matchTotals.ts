import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import { isWeekCompleted } from "@/utils/weekUtils";
import { MatchTotal, SortOrder } from "./types";

/**
 * Every game's combined score, both teams together, sorted. The same playoff
 * rule as the team scores, with losers-bracket games dropped explicitly.
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

    const playoffWeekStart =
      seasonData.league?.settings?.playoff_week_start || 15;

    // Process each week
    Object.entries(matchups).forEach(([weekStr, weekMatchups]) => {
      const week = parseInt(weekStr);

      // Skip incomplete weeks
      if (!isWeekCompleted(week, seasonData.league)) {
        return;
      }

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
};
