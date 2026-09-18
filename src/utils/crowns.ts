import { seasons } from "@/data";
import { getRosterPointsFor } from "@/utils/recordUtils";
import { getSeasonBreakdown } from "@/utils/seasonBreakdown";
import { getFinalStandings } from "@/utils/finalStandings";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { memoiseOverSeasons } from "@/utils/cache";

/**
 * The Triple Crown, and the Scumbo.
 *
 * Both are the league's own conventions, and they are deliberately not mirror
 * images of each other:
 *
 *   THE TRIPLE CROWN   most wins · most points · won the league
 *   THE SCUMBO         worst all-play record · fewest wins · fewest points
 *
 * The good one asks you to win the thing; the bad one asks how you did against
 * the whole league every week. That asymmetry is the point. You can top the
 * table and the scoring charts and still lose the final, so the Triple Crown
 * stays rare; and you can finish last on a kind schedule without having been
 * the worst team, so the Scumbo asks the all-play question instead.
 *
 * Each is three legs, so it is a spectrum rather than a label — one leg is a
 * bad year, two is a miserable one, three is the full set. `legs` counts them
 * and the individual flags say which.
 *
 * A leg tied between managers is awarded to all of them: being jointly the
 * worst in the league is not a way of not being the worst in the league.
 * `shared` records it so the UI can say so rather than implying it was outright.
 */

export interface SeasonCrown {
  rosterId: number;
  managerId: string;
  /* The good three. */
  mostWins: boolean;
  mostPoints: boolean;
  champion: boolean;
  /** 0-3. Three is the Triple Crown. */
  crownLegs: number;
  /* The bad three. */
  worstAllPlay: boolean;
  fewestWins: boolean;
  fewestPoints: boolean;
  /** 0-3. Three is the full Scumbo. */
  scumboLegs: number;
  /** Legs that were tied rather than held outright. */
  shared: string[];
  /**
   * True while the season is still being played. Both awards are given at the
   * end of a season, so a provisional one is a standing, not a trophy — after
   * one week of 2026 somebody already held all three bad legs.
   */
  provisional: boolean;
}

const compute = (year: number): SeasonCrown[] => {
  const season = seasons[year as keyof typeof seasons];
  if (!season?.rosters?.length) return [];

  const breakdown = getSeasonBreakdown(year);
  const anyPlayed = breakdown.some((b) => b.wins + b.losses + b.ties > 0);
  if (!anyPlayed) return [];

  const worstRate = breakdown[breakdown.length - 1]?.winPercentage ?? null;

  const teams = season.rosters.map((roster) => ({
    rosterId: roster.roster_id,
    wins: roster.settings?.wins ?? 0,
    points: getRosterPointsFor(roster),
  }));

  const maxWins = Math.max(...teams.map((t) => t.wins));
  const minWins = Math.min(...teams.map((t) => t.wins));
  const maxPoints = Math.max(...teams.map((t) => t.points));
  const minPoints = Math.min(...teams.map((t) => t.points));

  // The champion only exists once the final is played. An in-progress
  // season has no champion rather than a provisional one, so nobody can hold
  // a Triple Crown on a season still being played.
  const complete = isSeasonSettled(season);
  const championRosterId = complete
    ? (getFinalStandings(year).find((s) => s.position === 1)?.rosterId ?? null)
    : null;

  return teams.flatMap((team) => {
    const roster = season.rosters.find((r) => r.roster_id === team.rosterId);
    const managerId = roster && getManagerIdBySleeperOwnerId(roster.owner_id);
    // A roster nobody claims would credit — or blame — the wrong person.
    if (!managerId) return [];

    const mostWins = team.wins === maxWins;
    const mostPoints = team.points === maxPoints;
    const champion = team.rosterId === championRosterId;
    const fewestWins = team.wins === minWins;
    const fewestPoints = team.points === minPoints;
    // Ties on the all-play rate share the leg, like the other two.
    const worstAllPlay =
      worstRate !== null &&
      breakdown.find((b) => b.rosterId === team.rosterId)?.winPercentage === worstRate;

    const shared: string[] = [];
    const tie = (held: boolean, others: number, label: string) => {
      if (held && others > 1) shared.push(label);
      return held;
    };

    return [
      {
        rosterId: team.rosterId,
        managerId,
        mostWins: tie(mostWins, teams.filter((t) => t.wins === maxWins).length, "most wins"),
        mostPoints: tie(mostPoints, teams.filter((t) => t.points === maxPoints).length, "most points"),
        champion,
        crownLegs: [mostWins, mostPoints, champion].filter(Boolean).length,
        worstAllPlay: tie(
          worstAllPlay,
          breakdown.filter((b) => b.winPercentage === worstRate).length,
          "worst all-play"
        ),
        fewestWins: tie(fewestWins, teams.filter((t) => t.wins === minWins).length, "fewest wins"),
        fewestPoints: tie(
          fewestPoints,
          teams.filter((t) => t.points === minPoints).length,
          "fewest points"
        ),
        scumboLegs: [worstAllPlay, fewestWins, fewestPoints].filter(Boolean).length,
        shared,
        provisional: !complete,
      } satisfies SeasonCrown,
    ];
  });
};

/** Every manager's crown and Scumbo legs for one season. */
export const getSeasonCrowns = memoiseOverSeasons("seasonCrowns", compute, 32);

/**
 * Whoever took the Scumbo that season — the worst all-play record.
 *
 * Includes a season in progress, whose entries carry `provisional`: "currently
 * worst" is worth showing, as long as it is not dressed up as a trophy.
 */
export const getScumboHolders = (year: number): SeasonCrown[] =>
  getSeasonCrowns(year).filter((c) => c.worstAllPlay);

/** A Triple Crown is all three: most wins, most points, and the title. */
export const getTripleCrown = (year: number): SeasonCrown | null =>
  getSeasonCrowns(year).find((c) => c.crownLegs === 3) ?? null;

/**
 * The full Scumbo: all three of the bad legs, in a season that has finished.
 *
 * Settled seasons only, for the same reason a Triple Crown needs a champion.
 */
export const getScumboCrown = (year: number): SeasonCrown[] =>
  getSeasonCrowns(year).filter((c) => c.scumboLegs === 3 && !c.provisional);
