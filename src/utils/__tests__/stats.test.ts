import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { allStats, computeStat, getStatContext } from "@/utils/stats";
import { getPlayoffWeekStart, isMeaningfulPlayoffGame } from "@/utils/playoffUtils";
import { everyMatchup } from "./helpers";

/**
 * The stat registry (C1) and its first stats (C3a/C3b).
 *
 * The registry's whole value is that twenty stats share one traversal, so the
 * traversal is what these check hardest: if it drops or duplicates games,
 * every stat built on it is wrong in the same invisible way.
 */
describe("stat context", () => {
  it("has one entry per team per played matchup", () => {
    const { games } = getStatContext();

    // everyMatchup is the independent traversal the snapshot suite uses.
    const played = everyMatchup().filter(
      ({ matchup }) => matchup.matchup_id != null
    );

    // Games are paired, so anything without an opponent is dropped by design;
    // the flattened list can only be smaller, never larger.
    expect(games.length).toBeLessThanOrEqual(played.length);
    expect(games.length).toBeGreaterThan(2000);
  });

  it("has no consolation games, and every real playoff game", () => {
    // A consolation game, or the games for third and fifth, is not league
    // history: half the league has stopped setting lineups by then. 2022
    // week 17's 125.98-point margin was one, and was the biggest ever.
    const { games, teamWeeks } = getStatContext();
    for (const game of teamWeeks.filter((g) => g.isPlayoff)) {
      const season = seasons[game.year];
      const start = getPlayoffWeekStart(season);
      expect(isMeaningfulPlayoffGame(game.raw, season, game.week, start), `${game.year} w${game.week}`).toBe(true);
    }
    expect(
      games.some((g) => g.year === 2022 && g.week === 17 && g.managerId === "hadkiss")
    ).toBe(false);
    // Five a season with byes (four eliminations and the final), three before.
    const perSeason = (year: number) =>
      games.filter((g) => g.isPlayoff && g.year === year).length / 2;
    expect(perSeason(2013)).toBe(3);
    expect(perSeason(2016)).toBe(5);
    expect(perSeason(2024)).toBe(5);
  });

  it("pairs every game with its real opponent", () => {
    const violations: string[] = [];

    for (const game of getStatContext().games) {
      if (game.rosterId === game.opponentRosterId) {
        violations.push(`${game.year} w${game.week}: paired with itself`);
      }
      if (Math.abs(game.margin - (game.points - game.opponentPoints)) > 1e-9) {
        violations.push(`${game.year} w${game.week} r${game.rosterId}: margin`);
      }
      const expected =
        game.margin > 0 ? "win" : game.margin < 0 ? "loss" : "tie";
      if (game.result !== expected) {
        violations.push(`${game.year} w${game.week} r${game.rosterId}: result`);
      }
    }

    expect(violations.slice(0, 5)).toEqual([]);
  });

  it("is symmetric — every game's mirror exists", () => {
    const { games } = getStatContext();
    const key = (year: number, week: number, a: number, b: number) =>
      `${year}|${week}|${a}|${b}`;
    const seen = new Set(
      games.map((g) => key(g.year, g.week, g.rosterId, g.opponentRosterId))
    );

    const missing = games.filter(
      (g) => !seen.has(key(g.year, g.week, g.opponentRosterId, g.rosterId))
    );

    expect(missing).toEqual([]);
  });
});

describe("stat registry", () => {
  it("gives every stat a unique id, label and description", () => {
    const stats = allStats();
    expect(stats.length).toBeGreaterThan(0);
    expect(new Set(stats.map((s) => s.id)).size).toBe(stats.length);
    for (const stat of stats) {
      expect(stat.label.length).toBeGreaterThan(0);
      expect(stat.description.length).toBeGreaterThan(0);
    }
  });

  it("ranks by the stat's own direction", () => {
    for (const stat of allStats()) {
      const entries = computeStat(stat.id, 20);
      const values = entries.map((e) => e.value);
      const sorted = [...values].sort((a, b) =>
        stat.direction === "high" ? b - a : a - b
      );
      expect(values).toEqual(sorted);
    }
  });

  it("returns entries that can actually be navigated to", () => {
    for (const stat of allStats()) {
      for (const e of computeStat(stat.id, 5)) {
        expect(e.subject).toBeTruthy();
        if (e.href) expect(e.href.startsWith("/")).toBe(true);
      }
    }
  });
});

describe("matchup records", () => {
  it("the unluckiest loss really is a loss, and beats most winning scores", () => {
    const [top] = computeStat("highest-scoring-loss", 1);
    const winningScores = getStatContext()
      .games.filter((g) => g.result === "win")
      .map((g) => g.points);

    const beaten = winningScores.filter((p) => p < top.value).length;
    // It should out-score the great majority of games that actually won.
    // (Ant's 127.6 beats 87% of them; the 138.42 that used to top this list
    // was a game for fifth place, which is not in league history.)
    expect(beaten / winningScores.length).toBeGreaterThan(0.85);
  });

  it("closest game counts each game once, not once per team", () => {
    // Keyed on the matchup href: two different games in the same week can
    // legitimately share a margin (2018 week 6 had two decided by 0.08), so a
    // year/week/value key would flag those as duplicates when they are not.
    const entries = computeStat("closest-margin", 25);
    const hrefs = entries.map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("the biggest blowout is a win with the largest margin", () => {
    const [top] = computeStat("biggest-margin", 1);
    const maxMargin = Math.max(
      ...getStatContext().games.map((g) => g.margin)
    );
    expect(top.value).toBeCloseTo(Math.round(maxMargin * 100) / 100, 2);
  });
});
