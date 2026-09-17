import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedRoster } from "@/types/roster";
import {
  calculateWeeklyLeagueRecord,
  determineMatchupResult,
  roundToTwoDecimals,
} from "@/utils/recordUtils";

/**
 * Expected wins, and the luck score derived from it (D7).
 *
 * THE DEFINITION, because this is the number the league will argue about:
 *
 *   In a given week a manager's score is played against every other score in
 *   the league that week — the all-play record `calculateWeeklyLeagueRecord`
 *   already computes. The share of that field they beat is what the week was
 *   worth:
 *
 *       weekly expected wins = (all-play wins + all-play ties / 2) / opponents
 *
 *   A manager who outscored everyone earns 1.000 for the week; last place
 *   earns 0.000; the middle of a twelve-team week earns about 0.545. Expected
 *   wins for a season is the sum of those weekly shares, and actual wins is
 *   what the schedule actually gave them. **Luck = actual − expected.**
 *
 * Why a share rather than a count: the league was ten teams in 2012-13 and
 * twelve since. An all-play count would make a 2012 week worth nine wins and a
 * 2015 week worth eleven; a share is worth one week either way, so seasons
 * fourteen years apart add up on the same axis.
 *
 * The rules, spelled out because each of them is a place this could be subtly
 * wrong:
 *
 * - **Ties count as half a win on both sides of the comparison.** A drawn
 *   head-to-head game is half an actual win, and a tied all-play comparison is
 *   half an expected one. Anything else breaks the conservation below. There
 *   are two drawn games and four tied score-pairs in league history, so this
 *   is not hypothetical.
 * - **Regular season only.** Playoff weeks are excluded (`week <
 *   playoff_week_start`): half the league is playing consolation games by then,
 *   and an all-play against a field that has stopped trying is not a measure of
 *   anything. This also matches every other all-play number on the site.
 * - **A week counts for a manager only if they played a real head-to-head game
 *   in it.** Expected wins must accrue over exactly the set of games that
 *   actual wins accrue over, or the difference between them stops being luck
 *   and starts being bookkeeping.
 * - **Scores are rounded to two decimals before every comparison**, which is
 *   Sleeper's own scoring precision and what the rest of the site compares on.
 *   Without it a 0.0000001 float difference decides a tie.
 *
 * Conservation, which is the property that makes the chart honest: in a week
 * where every roster is paired, the all-play comparisons total C(n,2), so the
 * league's expected wins total n/2 — exactly the n/2 head-to-head wins the
 * week handed out. So league-wide, expected wins always equals actual wins,
 * and the luck scores sum to zero: one manager's good fortune is another's
 * bad. `luck.test.ts` asserts this against every real season.
 */

export interface AllPlayRecord {
  wins: number;
  losses: number;
  ties: number;
}

/**
 * What one week was worth, as a share of a win, from that week's all-play
 * record. A week with no opponents (a roster missing from the file) is worth
 * nothing rather than dividing by zero.
 */
export const weeklyExpectedWins = ({
  wins,
  losses,
  ties,
}: AllPlayRecord): number => {
  const opponents = wins + losses + ties;
  return opponents > 0 ? (wins + ties * 0.5) / opponents : 0;
};

export interface RosterLuck {
  rosterId: number;
  /** Head-to-head games played — the denominator both totals share. */
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** Head-to-head wins, a tie counting half. */
  actualWins: number;
  /** Sum of the weekly all-play shares. */
  expectedWins: number;
}

/**
 * One season's actual and expected wins, per roster.
 *
 * Takes the weeks to count rather than working them out, so the caller owns
 * the two policy decisions (playoff cut-off, and how much of an in-progress
 * season has finished) and this stays a pure function of the numbers.
 */
export const seasonLuck = (
  rosters: readonly ExtendedRoster[],
  matchups: Record<string, ExtendedMatchup[]>,
  weeks: readonly number[]
): RosterLuck[] =>
  rosters.map((roster) => {
    const totals: RosterLuck = {
      rosterId: roster.roster_id,
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      actualWins: 0,
      expectedWins: 0,
    };

    for (const week of weeks) {
      const weekMatchups = matchups[week.toString()];
      if (!weekMatchups) continue;

      const teamMatchup = weekMatchups.find(
        (m) => m.roster_id === roster.roster_id
      );
      if (!teamMatchup) continue;

      const opponent = weekMatchups.find(
        (m) =>
          m.matchup_id === teamMatchup.matchup_id &&
          m.roster_id !== roster.roster_id
      );
      // No opponent is a bye or a broken week. Skipping it keeps the two
      // totals over the same set of games — see the note above.
      if (!opponent) continue;

      const allPlay = calculateWeeklyLeagueRecord(roster, week, matchups);
      if (allPlay.wins + allPlay.losses + allPlay.ties === 0) continue;

      const result = determineMatchupResult(
        roundToTwoDecimals(teamMatchup.points),
        roundToTwoDecimals(opponent.points)
      );

      totals.games += 1;
      if (result === "W") totals.wins += 1;
      else if (result === "L") totals.losses += 1;
      else totals.ties += 1;

      totals.actualWins += result === "W" ? 1 : result === "T" ? 0.5 : 0;
      totals.expectedWins += weeklyExpectedWins(allPlay);
    }

    return totals;
  });

/**
 * Add two sets of totals — a manager's seasons into a career.
 *
 * Expected wins are floating-point sums of elevenths, so they are rounded once
 * at the point of display, never here: rounding each season before adding them
 * would drift a career by a tenth of a win and invite exactly the argument
 * this chart is supposed to settle.
 */
export const addLuck = <T extends Omit<RosterLuck, "rosterId">>(
  into: T,
  from: Omit<RosterLuck, "rosterId">
): T => ({
  ...into,
  games: into.games + from.games,
  wins: into.wins + from.wins,
  losses: into.losses + from.losses,
  ties: into.ties + from.ties,
  actualWins: into.actualWins + from.actualWins,
  expectedWins: into.expectedWins + from.expectedWins,
});
