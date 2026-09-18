import { describe, expect, it } from "vitest";
import { YEARS } from "@/domain/constants";
import { gameHref } from "@/presentation/components/PlayerDetail/PlayerStatsCardLink";
import { calculatePositionalStats } from "@/utils/statsExplorer";
import { PINNED_THROUGH } from "./helpers";

/**
 * The explorer paired every eliminated team sitting out a playoff week with
 * whichever other one came first in the file, because their `matchup_id` is
 * null and `null === null`. With playoffs included that was 48 invented games
 * and eight rows in the sample table linking to ".../matchups/15/null".
 */
describe("the stats explorer, playoffs included", () => {
  const all = calculatePositionalStats([], YEARS, true);

  it("only lists games that have a page", () => {
    const dead = all.sampleMatchups.filter((m) => gameHref(m) === null);
    expect(dead).toEqual([]);
  });

  it("counts every game once from each side, so league-wide wins equal losses", () => {
    // The fake pairings were lopsided — the 2nd, 3rd and 4th teams sitting out
    // all "played" the 1st — which is how 1,315 wins came to sit beside 1,323
    // losses. A real game is a win on one side and a loss on the other.
    expect(all.wins).toBe(all.losses);
    expect(all.totalMatchups).toBe(all.wins + all.losses + all.ties);
  });

  it("leaves the regular-season numbers alone", () => {
    // Unpaired team-weeks only exist in playoff weeks, so the default view —
    // regular season only — was never affected.
    const finished = YEARS.filter((year) => year <= PINNED_THROUGH);
    expect(calculatePositionalStats([], finished, false).totalMatchups).toBe(2212);
  });
});
