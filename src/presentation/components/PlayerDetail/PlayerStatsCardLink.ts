import { isRealPairing } from "@/presentation/components/SeeAlso/pairing";
import type { PlayerPerformance } from "./PerformanceTable";

/**
 * Where a performance's game lives, or null when it has no page.
 *
 * `matchup_id` is typed as a number but is null in the data for a team with no
 * opponent left — 48 such team-weeks, all eliminated teams still setting a
 * lineup in a playoff week — and `history.tsx` renders "Invalid matchup data"
 * for anything that is not exactly two sides sharing a matchup id. So the stored
 * id is checked against the season before it becomes a link, by `isRealPairing`,
 * which E2 wrote for this exact question on the matchup rail.
 *
 * Today's archive happens to keep those team-weeks out of `usePlayerStats` (a
 * playoff week is only counted when the winners bracket has that roster in that
 * round), so this returns a link for every performance the page can currently
 * show. It is the filter in front of the link that makes that a fact rather
 * than a coincidence: the pool of unpaired team-weeks is real, and nothing about
 * bracket membership is a promise about what a URL resolves to.
 *
 * Requires that season's matchups to be loaded (A2a). Returns null while they
 * are not, which is the safe direction — no link rather than an unverified one.
 * The player page loads every season, so it never sees that case.
 */
export const gameHref = (
  game: Pick<PlayerPerformance, "year" | "week" | "matchupId"> | null
): string | null => {
  if (!game) return null;
  if (!isRealPairing(game.year, game.week, game.matchupId)) return null;
  return `/seasons/${game.year}/matchups/${game.week}/${game.matchupId}`;
};
