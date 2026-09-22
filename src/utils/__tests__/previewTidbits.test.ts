import { describe, expect, it } from "vitest";
import { getStatContext } from "@/utils/stats/traverse";
import { BLOWOUT_MARGIN, seriesTidbits } from "@/utils/previewTidbits";
import { PINNED_THROUGH } from "./helpers";

/**
 * The series in sentences (K1). Checked against the regular-season games
 * directly, through the last finished season, so the live one cannot move it.
 */

const side = (managerId: string) => ({ managerId, ownerId: "", name: managerId });

describe("a series' tidbits", () => {
  it("quotes the biggest regular-season win between the two", () => {
    const [thd, sol] = [side("thd"), side("sol")];
    const meetings = getStatContext().games.filter(
      (g) =>
        g.isRegularSeason &&
        g.year <= PINNED_THROUGH &&
        g.managerId === "thd" &&
        g.opponentManagerId === "sol"
    );
    const widest = Math.max(...meetings.map((g) => Math.abs(g.margin)));
    expect(widest).toBeGreaterThanOrEqual(BLOWOUT_MARGIN);
    const line = seriesTidbits(thd, sol, 3).find((t) => t.text.startsWith("Biggest win"));
    expect(line?.text).toContain(`by ${widest.toFixed(1)} in 2014`);
  });

  it("is most notable first, and says nothing about a pair that never met", () => {
    const tidbits = seriesTidbits(side("thd"), side("sol"), 3);
    const weights = tidbits.map((t) => t.weight);
    expect(weights).toEqual([...weights].sort((x, y) => y - x));
    const strangers = seriesTidbits(side("nobody"), side("noone"), 3);
    expect(strangers).toEqual([]);
  });
});
