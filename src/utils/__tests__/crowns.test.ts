import { beforeAll, describe, expect, it } from "vitest";
import { loadAllSeasons, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { getSeasonCrowns, getTripleCrown, getScumboCrown } from "@/utils/crowns";
import { getSeasonBreakdown } from "@/utils/seasonBreakdown";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { PINNED_THROUGH } from "./helpers";

beforeAll(async () => {
  await loadAllSeasons();
});

/**
 * The league's own two conventions. Both name a specific person in a specific
 * year, so both have to be right rather than roughly right.
 */
describe("crowns", () => {
  it("awards a Triple Crown only for all three legs", () => {
    for (const year of YEAR_NUMBERS) {
      const crown = getTripleCrown(year);
      if (!crown) continue;
      expect(crown.mostWins).toBe(true);
      expect(crown.mostPoints).toBe(true);
      expect(crown.champion).toBe(true);
    }
  });

  it("finds the two Triple Crowns in league history", () => {
    // jay 2018 and dix 2022 — verified by hand against wins, points and the
    // bracket. If a third appears, the data changed and someone should look.
    const won = YEAR_NUMBERS.filter((year) => year <= PINNED_THROUGH)
      .map((year) => [year, getTripleCrown(year)?.managerId])
      .filter(([, id]) => id);
    expect(won).toEqual([
      [2018, "jay"],
      [2022, "dix"],
    ]);
  });

  it("never awards a Triple Crown on a season with no champion yet", () => {
    for (const year of YEAR_NUMBERS) {
      if (isSeasonSettled(seasons[year])) continue;
      // An in-progress season has a leader, not a champion — the playoffs
      // included, when the brackets exist and the final does not.
      expect(getTripleCrown(year)).toBeNull();
      expect(getSeasonCrowns(year).every((c) => !c.champion)).toBe(true);
    }
  });

  it("gives the Scumbo to the worst all-play record, not to last place", () => {
    for (const year of YEAR_NUMBERS) {
      const breakdown = getSeasonBreakdown(year);
      if (!breakdown.length) continue;
      const worst = breakdown[breakdown.length - 1];
      if (worst.wins + worst.losses + worst.ties === 0) continue;

      const holders = getSeasonCrowns(year).filter((c) => c.worstAllPlay);
      expect(holders.length).toBeGreaterThan(0);
      for (const holder of holders) {
        const record = breakdown.find((b) => b.rosterId === holder.rosterId);
        expect(record?.winPercentage).toBe(worst.winPercentage);
      }
    }
  });

  it("does not award a full Scumbo on a season still being played", () => {
    // Caught by this test: after one completed week of 2026, htc held all
    // three bad legs. One week is a standing, not a season.
    for (const year of YEAR_NUMBERS) {
      const complete = (seasons[year]?.winners_bracket?.length ?? 0) > 0;
      if (complete) continue;
      expect(getScumboCrown(year)).toEqual([]);
      // But it is still legitimate to say who is currently worst.
      expect(getSeasonCrowns(year).every((c) => c.provisional)).toBe(true);
    }
  });

  it("counts legs consistently with the flags", () => {
    for (const year of YEAR_NUMBERS) {
      for (const crown of getSeasonCrowns(year)) {
        expect(crown.crownLegs).toBe(
          [crown.mostWins, crown.mostPoints, crown.champion].filter(Boolean).length
        );
        expect(crown.scumboLegs).toBe(
          [crown.worstAllPlay, crown.fewestWins, crown.fewestPoints].filter(Boolean).length
        );
      }
    }
  });

  it("records the full Scumbos", () => {
    const full = YEAR_NUMBERS.filter((year) => year <= PINNED_THROUGH).flatMap(
      (year) => getScumboCrown(year).map((c) => `${year} ${c.managerId}`)
    );
    // Hand-checked against the three legs season by season.
    expect(full).toEqual([
      "2012 fin",
      "2013 kitch",
      "2015 brock",
      "2017 rich",
      "2021 fin",
      "2022 thd",
      "2023 kitch",
      "2024 fin",
      "2025 rich",
    ]);
  });
});
