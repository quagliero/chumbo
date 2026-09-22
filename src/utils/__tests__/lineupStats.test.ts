import { describe, expect, it } from "vitest";
import { computeStat, getStatContext } from "@/utils/stats";
import type { Game } from "@/utils/stats";
import { getPlayerRows } from "@/utils/lineupAnalysis";

/**
 * Lineup stats (C2).
 *
 * These check the numbers rather than the plumbing — the registry's own suite
 * already covers ids, sorting and hrefs. What can go wrong here is arithmetic
 * that is quietly impossible: efficiency above 100%, a negative bench, or an
 * accusation ("you benched X for Y") that the lineup does not actually support.
 */

const LINEUP_STATS = [
  "bench-points",
  "bench-points-season",
  "manager-efficiency",
  "worst-start-sit",
  "bench-bandit",
];

const gamesFor = (year: number, week: number, managerId: string): Game[] =>
  // teamWeeks, not games: these stats are about lineups, so they include
  // the playoff weeks where an eliminated team had no opponent.
  getStatContext().teamWeeks.filter(
    (game) =>
      game.year === year && game.week === week && game.managerId === managerId
  );

describe("lineup stats", () => {
  it("never leaves a negative number of points on the bench", () => {
    for (const id of ["bench-points", "bench-points-season"]) {
      const entries = computeStat(id);
      expect(entries.length).toBeGreaterThan(0);
      const negative = entries.filter((entry) => entry.value < 0);
      expect(negative).toEqual([]);
    }
  });

  /**
   * The started lineup is one of the candidate lineups, so the optimal lineup
   * can never be worse than it. Anything over 100% means `getOptimalLineup`
   * failed to place a player who really did start — the artefact this module
   * refuses to rank.
   */
  it("never reports a manager as more than 100% efficient", () => {
    const entries = computeStat("manager-efficiency");
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      expect(entry.value).toBeGreaterThan(0);
      expect(entry.value).toBeLessThanOrEqual(100);
    }
  });

  /**
   * The two team-weeks where the optimiser still comes back below the lineup
   * actually started (2012 w6, 2015 w9 — a gap in the player dictionary, not a
   * manager achievement). They must be skipped, not ranked.
   */
  it("drops the team-weeks whose optimal lineup is impossible", () => {
    const artefacts: Array<[number, number, string]> = [
      [2012, 6, "dix"],
      [2015, 9, "htc"],
    ];

    for (const [year, week, managerId] of artefacts) {
      // The game itself is real and present — it is only the grading we refuse.
      expect(gamesFor(year, week, managerId).length).toBe(1);

      const ranked = computeStat("worst-start-sit").filter(
        (entry) =>
          entry.year === year &&
          entry.week === week &&
          entry.subject === managerId
      );
      expect(ranked).toEqual([]);
    }
  });

  /**
   * The point of this stat is that it is a specific accusation, so the
   * accusation has to hold: the named player really was on the bench, the
   * named starter really did start, and the swap really was legal and worth
   * exactly what we claim.
   */
  it("accuses someone of a start/sit that the lineup actually supports", () => {
    const entries = computeStat("worst-start-sit", 25);
    expect(entries.length).toBe(25);

    const unsupported: string[] = [];

    for (const entry of entries) {
      const [game] = gamesFor(entry.year!, entry.week!, entry.subject);
      if (!game) {
        unsupported.push(`${entry.detail}: no such game`);
        continue;
      }

      const { starters, bench } = getPlayerRows(game.raw, game.year);
      const supported = bench.some((benched) =>
        starters.some(
          (starter) =>
            Math.abs(benched.points - starter.points - entry.value) < 0.011
        )
      );
      if (!supported) unsupported.push(`${entry.detail}: no such pair`);

      // A benched player who outscored nobody is not a start/sit.
      const bestBench = Math.max(...bench.map((row) => row.points), 0);
      const worstStarter = Math.min(...starters.map((row) => row.points), 0);
      if (entry.value > bestBench - worstStarter + 0.011) {
        unsupported.push(`${entry.detail}: gap exceeds the roster`);
      }
    }

    expect(unsupported).toEqual([]);
  });

  it("only counts points a player scored while genuinely benched", () => {
    const [top] = computeStat("bench-bandit", 1);

    // Recompute the leader independently, straight off the raw lineups.
    const playerId = top.href!.replace("/players/", "");
    let total = 0;
    for (const game of getStatContext().teamWeeks) {
      if (game.benchIncomplete || game.points <= 0) continue;
      if (game.starters.includes(playerId)) continue;
      if (!game.players.includes(playerId)) continue;
      const points = game.playersPoints[playerId] ?? 0;
      if (points > 0) total += points;
    }

    expect(total).toBeCloseTo(top.value, 0);
    expect(top.value).toBeGreaterThan(100);
  });

  it("excludes the season whose per-player scores are a reconstruction", () => {
    for (const id of LINEUP_STATS) {
      const dated = computeStat(id).filter((entry) => entry.year === 2019);
      expect(dated).toEqual([]);
    }
  });

  it("gives every entry something to click and something to read", () => {
    for (const id of LINEUP_STATS) {
      const entries = computeStat(id, 10);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.subject).toBeTruthy();
        expect(entry.href).toMatch(/^\/(managers|players|seasons)\//);
        expect(entry.detail?.length ?? 0).toBeGreaterThan(10);
      }
    }
  });

  /**
   * A manager's career bench total is the sum of their seasons. If the two
   * disagree one of them is double-counting or dropping team-weeks.
   */
  it("reconciles career bench points with the seasons that make them up", () => {
    const bySeason = new Map<string, number>();
    for (const entry of computeStat("bench-points-season")) {
      bySeason.set(
        entry.subject,
        (bySeason.get(entry.subject) ?? 0) + entry.value
      );
    }

    const mismatched: string[] = [];
    for (const entry of computeStat("bench-points")) {
      const summed = bySeason.get(entry.subject) ?? 0;
      // Each season is rounded before it is summed, so allow a little drift.
      if (Math.abs(summed - entry.value) > 1) {
        mismatched.push(`${entry.subject}: ${summed} vs ${entry.value}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
