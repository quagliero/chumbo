import { describe, expect, it } from "vitest";
import { seasons, getPlayer } from "@/data";
import { YEARS } from "@/domain/constants";

/**
 * `league.roster_positions` declares the lineup slots in order, and every
 * `starters` array is expected to line up with it index for index.
 *
 * H9: that was false for 2016-2019, which declared `... TE K DEF FLEX` while
 * their starters were actually ordered `... TE FLEX K DEF`. Only
 * `leagueRules.ts` read the field, so the visible damage was the Rules page
 * listing slots in the wrong order — but mapping `starters[i]` to
 * `roster_positions[i]` is the natural way to derive a player's slot, and
 * doing so would have put kickers in DEF slots across four seasons.
 *
 * The assertion is on the DOMINANT position at each index rather than every
 * single slot, because a handful of players carry a stale position in the
 * dictionary (someone listed as WR today who lined up at TE in 2015). Those
 * show up in natively-correct Sleeper seasons too, so they are dictionary
 * noise, not a slot-order problem. A real slot-order error moves an entire
 * column and is caught easily.
 */

const FLEX_ELIGIBLE = new Set(["WR", "RB", "TE", "FB"]);

const positionOf = (id: string, year: number): string | null => {
  if (/^[A-Z]{2,3}$/.test(id)) return "DEF";
  const player = getPlayer(id, year);
  const pos = player?.position;
  // "UNK" is getPlayer's fallback for the legacy string-named players in
  // 2012-2015 — it means "not in the dictionary", not a real position, so it
  // carries no evidence about which slot this is. 2012 alone has 41 of them
  // in the kicker slot.
  return !pos || pos === "UNK" ? null : pos;
};

describe("declared lineup slots match the lineups actually played", () => {
  const years = YEARS.filter((y) => seasons[y]?.league?.roster_positions);

  it.each(years)("%i", (year) => {
    const declared = (seasons[year].league.roster_positions as string[]).filter(
      (slot) => slot !== "BN"
    );

    // tally the positions seen at each slot index across the season
    const seen: Record<number, Record<string, number>> = {};
    for (let week = 1; week <= 13; week += 1) {
      for (const matchup of seasons[year].matchups?.[String(week)] ?? []) {
        (matchup.starters ?? []).forEach((id, i) => {
          if (i >= declared.length) return;
          const pos = positionOf(String(id), year);
          if (!pos) return;
          (seen[i] ??= {})[pos] = ((seen[i] ?? {})[pos] ?? 0) + 1;
        });
      }
    }

    const wrong: string[] = [];
    declared.forEach((slot, i) => {
      const tally = Object.entries(seen[i] ?? {});
      if (!tally.length) return;
      const total = tally.reduce((sum, [, n]) => sum + n, 0);
      const [topPos, topCount] = tally.sort((a, b) => b[1] - a[1])[0];

      if (slot === "FLEX") {
        // a flex slot should hold a mix, and all of it flex-eligible
        const eligible = tally
          .filter(([pos]) => FLEX_ELIGIBLE.has(pos))
          .reduce((sum, [, n]) => sum + n, 0);
        if (eligible / total < 0.9) {
          wrong.push(
            `slot ${i} declared FLEX but held ${tally
              .map(([p, n]) => `${p}:${n}`)
              .join(", ")}`
          );
        }
        return;
      }

      // a fixed slot should be overwhelmingly that position
      if (topPos !== slot || topCount / total < 0.9) {
        wrong.push(
          `slot ${i} declared ${slot} but held ${tally
            .map(([p, n]) => `${p}:${n}`)
            .join(", ")}`
        );
      }
    });

    expect(wrong).toEqual([]);
  });
});
