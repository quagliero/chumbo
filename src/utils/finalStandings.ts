import { seasons } from "@/data";
import { getRosterPointsFor, sortTeamsByRecord } from "@/utils/recordUtils";
import { memoiseOverSeasons } from "@/utils/cache";
import type { BracketMatch } from "@/types/bracket";

/**
 * Where every roster actually finished a season (1 = champion).
 *
 * `getSeasonPlacement` already returns a `finalStanding`, but that one is
 * regular-season record order: a team that went 12-1 and lost in the semi-final
 * comes out first, which is not a finish anyone in this league would recognise.
 * The real order is the one the playoffs decided, and it comes out of the two
 * brackets.
 *
 * The brackets use TWO different conventions, which is the trap here:
 *
 *   2012-2019  the losers bracket's `p` is the absolute league position —
 *              5 and 7 in the ten-team seasons, 7, 9 and 11 in the twelve-team
 *              ones. It can be read straight off.
 *   2020-2025  the losers bracket restarts at 1, 3, 5. Read straight off, the
 *              team that won the consolation bracket comes out FIRST, tied with
 *              the champion.
 *
 * Detected rather than hardcoded by year: if the losers bracket's lowest
 * placement falls inside the winners bracket's range, the two are numbering the
 * same space and the losers bracket is offset by the size of the winners
 * bracket. A future season that changes playoff size is then handled without
 * anyone remembering this comment exists.
 */

export interface FinalStanding {
  rosterId: number;
  /** 1 = champion. Always a complete 1..N with no gaps or ties. */
  position: number;
  /** How it was decided — brackets, or regular-season record as a fallback. */
  source: "bracket" | "record";
}

const placementsFrom = (
  bracket: BracketMatch[] | undefined,
  offset: number
): Map<number, number> => {
  const placed = new Map<number, number>();
  for (const match of bracket ?? []) {
    if (!match.p) continue;
    // A placement match ranks both teams: the winner takes `p`, the loser the
    // place below it.
    if (typeof match.w === "number") placed.set(match.w, match.p + offset);
    if (typeof match.l === "number") placed.set(match.l, match.p + offset + 1);
  }
  return placed;
};

const teamsIn = (bracket: BracketMatch[] | undefined): Set<number> => {
  const teams = new Set<number>();
  for (const match of bracket ?? []) {
    for (const team of [match.t1, match.t2, match.w, match.l]) {
      if (typeof team === "number") teams.add(team);
    }
  }
  return teams;
};

const lowest = (bracket: BracketMatch[] | undefined): number | null => {
  const places = (bracket ?? []).map((m) => m.p).filter((p): p is number => !!p);
  return places.length ? Math.min(...places) : null;
};

const highest = (bracket: BracketMatch[] | undefined): number | null => {
  const places = (bracket ?? []).map((m) => m.p).filter((p): p is number => !!p);
  return places.length ? Math.max(...places) : null;
};

const compute = (year: number): FinalStanding[] => {
  const season = seasons[year as keyof typeof seasons];
  if (!season?.rosters?.length) return [];

  const winners = season.winners_bracket as BracketMatch[] | undefined;
  const losers = season.losers_bracket as BracketMatch[] | undefined;

  // Relative numbering: the losers bracket starts inside the winners bracket's
  // range, so it is ranking its own six teams rather than the league.
  const winnersTop = highest(winners);
  const losersBottom = lowest(losers);
  const relative =
    winnersTop !== null && losersBottom !== null && losersBottom <= winnersTop;
  const offset = relative ? teamsIn(winners).size : 0;

  const placed = new Map<number, number>([
    ...placementsFrom(winners, 0),
    ...placementsFrom(losers, offset),
  ]);

  // Regular-season order, used both for the rosters no bracket placed (2012 and
  // 2013 bracket only eight of ten) and for a season with no brackets at all
  // (one in progress).
  const byRecord = sortTeamsByRecord(
    season.rosters.map((roster) => ({
      rosterId: roster.roster_id,
      wins: roster.settings?.wins ?? 0,
      losses: roster.settings?.losses ?? 0,
      ties: roster.settings?.ties ?? 0,
      pointsFor: getRosterPointsFor(roster),
    }))
  );

  const standings: FinalStanding[] = [];
  const taken = new Set<number>();

  for (const [rosterId, position] of placed) {
    standings.push({ rosterId, position, source: "bracket" });
    taken.add(position);
  }

  // Everyone the brackets did not place goes below them, in record order, into
  // whatever positions are left. Keeps the result a clean 1..N.
  let next = 1;
  for (const team of byRecord) {
    if (placed.has(team.rosterId)) continue;
    while (taken.has(next)) next++;
    standings.push({ rosterId: team.rosterId, position: next, source: "record" });
    taken.add(next);
  }

  return standings.sort((a, b) => a.position - b.position);
};

/** Memoised: the bump chart asks for all fifteen seasons on every render. */
export const getFinalStandings = memoiseOverSeasons("finalStandings", compute, 32);

/** Just this roster's finish, or null if the season has no rosters. */
export const getFinalPosition = (year: number, rosterId: number): number | null =>
  getFinalStandings(year).find((s) => s.rosterId === rosterId)?.position ?? null;
