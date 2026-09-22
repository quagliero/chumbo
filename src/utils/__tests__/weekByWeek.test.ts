import { describe, expect, it } from "vitest";
import { getStatContext } from "@/utils/stats/traverse";
import { bestAndWorstWeeks, getWeekByWeek } from "@/utils/weekByWeek";

/**
 * Each manager in each week of the season. Invariants, which hold whatever the
 * live season does: every regular-season game is in exactly one cell, and the
 * cells add back up to the career.
 */

describe("week by week", () => {
  const { weeks, managers } = getWeekByWeek();
  const regular = getStatContext().games.filter((g) => g.isRegularSeason && g.managerId);

  it("covers the regular season's weeks and nothing after", () => {
    expect(weeks[0]).toBe(1);
    // Fourteen games in the longest regular seasons; the playoffs are out.
    expect(Math.max(...weeks)).toBe(14);
  });

  it("puts every regular-season game in one cell", () => {
    for (const manager of managers) {
      const mine = regular.filter((g) => g.managerId === manager.managerId);
      const cells = [...manager.weeks.values()];
      expect(cells.reduce((n, c) => n + c.games, 0)).toBe(mine.length);
      expect(cells.reduce((n, c) => n + c.wins, 0)).toBe(
        mine.filter((g) => g.result === "win").length
      );
    }
  });

  it("measures points against the league that same week, so the league nets to zero", () => {
    // Everyone's games together, weighted by games, are the league itself.
    let above = 0;
    for (const manager of managers) {
      for (const cell of manager.weeks.values()) above += cell.vsLeague * cell.games;
    }
    expect(Math.abs(above)).toBeLessThan(0.01);
  });

  it("names a best and a worst week only from cells worth reading", () => {
    for (const manager of managers) {
      const extremes = bestAndWorstWeeks(manager);
      if (!extremes) continue;
      expect(extremes.best.games).toBeGreaterThanOrEqual(4);
      expect(extremes.best.winRate).toBeGreaterThanOrEqual(extremes.worst.winRate);
    }
  });
});
