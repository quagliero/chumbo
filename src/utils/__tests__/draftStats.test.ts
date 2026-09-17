import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { computeStat, getStatContext } from "@/utils/stats";

/**
 * Draft records (C4).
 *
 * The registry's own suite already checks that every stat sorts, has a subject
 * and links somewhere. What it cannot check is whether these four are joining
 * the right two things together: a pick is a row in `picks.json` and the points
 * are in the matchups, and the only thing tying them together is `roster_id`.
 * Get that wrong and the stats still look plausible — they just describe the
 * wrong manager. So these tests pin the join, not the leaderboard.
 */

const pickCount = (year: number) => seasons[year]?.picks?.length ?? 0;

describe("draft value", () => {
  it("scores every pick from every completed season, and no others", () => {
    const entries = computeStat("best-draft-picks");

    // 2019's per-player scoring is a reconstruction, so `requiresLineups`
    // hides it; 2026 has a draft but no football yet. Everything else is in.
    const scored = YEAR_NUMBERS.filter(
      (year) => year !== 2019 && year !== 2026 && pickCount(year) > 0
    );
    const expected = scored.reduce((total, year) => total + pickCount(year), 0);

    expect(entries.length).toBe(expected);
    const years = new Set(entries.map((e) => e.year));
    expect([...years].sort()).toEqual([...scored].sort());
  });

  it("is the same list read from both ends", () => {
    const best = computeStat("best-draft-picks");
    const worst = computeStat("worst-draft-picks");

    expect(worst.length).toBe(best.length);
    expect(worst[0].value).toBeCloseTo(best[best.length - 1].value, 6);
    expect(best[0].value).toBeGreaterThan(0);
    expect(worst[0].value).toBeLessThan(0);
  });

  it("measures against the slot, not the raw total", () => {
    // If it ranked on points, round 1 would own the top of the list. The
    // point of the stat is that it does not.
    const top = computeStat("best-draft-picks", 20);
    expect(top.some((e) => /round (?:[5-9]|1[0-5]) /.test(e.detail ?? ""))).toBe(
      true
    );
  });

  it("credits the drafting roster, not whoever ended up with the player", () => {
    // 2024: thd took Lamar Jackson in round 4 and traded him in week 1. The
    // pick is the drafter's; the points are not. Both halves have to hold, or
    // the join has slipped a roster.
    const [lamar] = computeStat("one-that-got-away", 1);
    expect(lamar.subject).toBe("Lamar Jackson");
    expect(lamar.year).toBe(2024);
    expect(lamar.detail).toContain("thd drafted him in round 4");

    const lamarPoints = getStatContext()
      .games.filter((game) => game.year === 2024 && game.managerId !== "thd")
      .reduce((total, game) => total + (game.playersPoints["4881"] ?? 0), 0);
    expect(lamar.value).toBeCloseTo(Math.round(lamarPoints * 10) / 10, 1);
  });

  it("only calls it a loss when the player did more for someone else", () => {
    for (const entry of computeStat("one-that-got-away", 50)) {
      const got = Number(/got (-?[\d.]+) pts/.exec(entry.detail ?? "")?.[1]);
      expect(entry.value).toBeGreaterThan(got);
    }
  });
});

describe("draft position", () => {
  it("has one row per slot the league has ever drafted from", () => {
    const entries = computeStat("draft-position-luck");
    expect(entries.map((e) => e.subject).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `Pick ${i + 1}`).sort()
    );
  });

  it("counts the twelve-team-only slots over fewer drafts", () => {
    const drafts = (subject: string) =>
      Number(
        /over (\d+) drafts/.exec(
          computeStat("draft-position-luck").find((e) => e.subject === subject)
            ?.detail ?? ""
        )?.[1]
      );

    // 2012-2013 had ten teams, so slots 11 and 12 are two seasons short.
    expect(drafts("Pick 1") - drafts("Pick 12")).toBe(2);
  });

  it("adds up to a league that wins half its games", () => {
    const entries = computeStat("draft-position-luck");
    const average =
      entries.reduce((total, e) => total + e.value, 0) / entries.length;
    // Not exactly 50: the slots have different numbers of seasons behind them.
    expect(average).toBeGreaterThan(48);
    expect(average).toBeLessThan(52);
  });
});

describe("most drafted", () => {
  it("counts picks across every draft, this year's included", () => {
    const entries = computeStat("most-drafted-players");
    const total = entries.reduce((sum, e) => sum + e.value, 0);

    // Only players taken more than once are listed, so the total is under the
    // 2,430 picks ever made — but it has to include the newest draft.
    const everyPick = YEAR_NUMBERS.reduce(
      (sum, year) => sum + pickCount(year),
      0
    );
    expect(total).toBeLessThan(everyPick);
    expect(entries.every((e) => e.value > 1)).toBe(true);

    const latest = Math.max(...YEAR_NUMBERS.filter((y) => pickCount(y) > 0));
    expect(entries.some((e) => e.detail?.includes(`-${latest},`))).toBe(true);
  });

  it("names players, not ids — defences included", () => {
    for (const entry of computeStat("most-drafted-players", 40)) {
      expect(entry.subject).not.toMatch(/^\d+$/);
      expect(entry.href).toMatch(/^\/players\/.+/);
    }
  });
});
