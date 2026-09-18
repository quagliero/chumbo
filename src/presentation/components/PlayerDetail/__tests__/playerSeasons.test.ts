import { describe, expect, it, vi } from "vitest";

// The hook is one `useMemo` around a pure computation; outside React, run it.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: <T>(compute: () => T) => compute(),
}));

const { usePlayerStats } = await import("@/hooks/playerDetail/usePlayerStats");
const { playerSeasons } = await import("../playerSeasons");

/**
 * I4. The "By season" rows sit directly under the page's career totals, and
 * each one can be shared as a card. If they were counted differently — bench
 * points in one and not the other — the card would contradict the page it
 * was copied from. So the rows must sum to the hook's own numbers.
 */
describe("playerSeasons", () => {
  // A long career across owners, a traded star, and a 2019 season.
  for (const [name, id] of [
    ["Alvin Kamara", "4035"],
    ["Saquon Barkley", "4866"],
    ["Travis Kelce", "1466"],
  ] as const) {
    it(`adds up to the page's career totals for ${name}`, () => {
      const stats = usePlayerStats(id);
      expect(stats, `${name} has stats`).not.toBeNull();
      const rows = playerSeasons(stats!.performances);

      const sum = (key: "points" | "starts" | "games") =>
        rows.reduce((total, row) => total + row[key], 0);

      expect(rows.length).toBe(stats!.seasonsPlayed);
      expect(sum("points")).toBeCloseTo(stats!.totalPoints, 6);
      expect(sum("starts")).toBe(stats!.totalStarts);
      expect(sum("games")).toBe(stats!.totalGames);
      expect(Math.max(...rows.map((r) => r.best))).toBeCloseTo(stats!.highestScore, 6);
    });
  }

  it("names who had him, most weeks first", () => {
    // Barkley 2018: drafted by thd, traded to sol in week 1, then to ant in
    // week 11 — sol held him longest.
    const rows = playerSeasons(usePlayerStats("4866")!.performances);
    const y2018 = rows.find((row) => row.year === 2018);
    expect(y2018?.managers).toEqual(["sol", "ant"]);
  });
});
