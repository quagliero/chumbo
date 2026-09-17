import { seasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import { calculateWeeklyLeagueRecord } from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { memoiseOverSeasons } from "@/utils/cache";

/**
 * A season's "breakdown" — each roster's all-play record.
 *
 * The breakdown is how a team would have done against the WHOLE league every
 * week, rather than against the one opponent the schedule gave them. The league
 * already reads it on the Breakdown tab, and it is the measure they use to
 * award the Scumbo: the wooden spoon goes to the worst team that season, and
 * last place in the standings is a statement about the fixture list as much as
 * about the team.
 *
 * Built on `calculateWeeklyLeagueRecord` with the same week filter the
 * Breakdown page uses — regular season only, and only completed weeks of a
 * season still being played — so this and that page can never disagree.
 */

export interface BreakdownRecord {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  /** All-play win percentage, a tie counting half. */
  winPercentage: number;
}

const compute = (year: number): BreakdownRecord[] => {
  const season = seasons[year as keyof typeof seasons];
  if (!season?.rosters?.length || !season.matchups) return [];

  const playoffWeekStart = season.league?.settings?.playoff_week_start || 15;
  const weeks = Object.keys(season.matchups)
    .map(Number)
    .filter(
      (week) =>
        week < playoffWeekStart &&
        (year === CURRENT_YEAR ? isWeekCompleted(week, season.league) : true)
    );

  return season.rosters
    .map((roster) => {
      let wins = 0;
      let losses = 0;
      let ties = 0;
      for (const week of weeks) {
        const record = calculateWeeklyLeagueRecord(roster, week, season.matchups);
        wins += record.wins;
        losses += record.losses;
        ties += record.ties;
      }
      const played = wins + losses + ties;
      return {
        rosterId: roster.roster_id,
        wins,
        losses,
        ties,
        winPercentage: played === 0 ? 0 : (wins + ties / 2) / played,
      };
    })
    .sort((a, b) => b.winPercentage - a.winPercentage);
};

/** Every roster's all-play record that season, best first. */
export const getSeasonBreakdown = memoiseOverSeasons("seasonBreakdown", compute, 32);

/**
 * The Scumbo: the worst breakdown of the season.
 *
 * Returns null for a season with nothing played yet, rather than handing the
 * trophy to whoever happens to sort last on a table of zeroes.
 */
export const getScumbo = (year: number): BreakdownRecord | null => {
  const breakdown = getSeasonBreakdown(year);
  if (!breakdown.length) return null;
  const worst = breakdown[breakdown.length - 1];
  return worst.wins + worst.losses + worst.ties === 0 ? null : worst;
};
