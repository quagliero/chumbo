import { seasons } from "@/data";
import { pairingsInWeek } from "./matchupRail";

/**
 * Is `/seasons/:year/matchups/:week/:matchupId` a page?
 *
 * `history.tsx` renders "Invalid matchup data" for anything that is not exactly
 * two sides sharing a matchup id, which a playoff team-week with no opponent
 * is not. A rail of dead ends is worse than no rail, so the one rail item built
 * from a stored matchup id checks it against the loaded season first.
 *
 * Reads `seasons` directly and so is only meaningful once that season's
 * matchups are loaded (A2a). Returns false while they are not, which is the
 * safe direction: no item rather than an unverified link.
 */
export const isRealPairing = (
  year: number,
  week: number,
  matchupId: number
): boolean => {
  const season = seasons[year];
  if (!season?.matchups) return false;
  const weekMatchups =
    season.matchups[String(week) as keyof typeof season.matchups];
  return pairingsInWeek(weekMatchups).some(
    (pairing) => pairing.matchupId === matchupId
  );
};
