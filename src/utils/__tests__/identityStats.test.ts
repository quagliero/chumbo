import { describe, expect, it } from "vitest";
import { computeStat, getStatContext } from "@/utils/stats";
import type { Game } from "@/utils/stats";
import { latestPlayedWeek } from "@/utils/stats/identityStats";

/**
 * Identity and fun (C6).
 *
 * These three stats are read by people, not by code, so what is worth guarding
 * is the honesty of the `detail` string. Two ways it could quietly become a
 * lie:
 *
 *   1. An archetype label whose number does not belong to the manager it is
 *      attached to — a horoscope with a decimal point in it.
 *   2. "On this day" surfacing a game from a week that has not been played.
 *      An in-progress season makes that easy: 2026 already has a matchups
 *      folder, and `schedule.json` carries weeks that have not happened.
 *
 * Both are checked against the flattened game list directly, not against the
 * module's own helpers.
 */

const wasPlayed = (game: Game) => game.points > 0 || game.opponentPoints > 0;

const numbersIn = (text: string): number[] =>
  (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

describe("on this day", () => {
  it("never shows a game from a week that has not been played", () => {
    const { games } = getStatContext();
    const now = latestPlayedWeek(games);
    if (!now) throw new Error("no played games — the fixture data is wrong");

    const entries = computeStat("on-this-day");
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      // Strictly earlier seasons: nothing from the season in progress, and
      // certainly nothing from one that has not started.
      expect(entry.year).toBeLessThan(now.year);
      expect(entry.week).toBe(now.week);
    }
  });

  it("only shows games that were actually played", () => {
    const real = new Set(
      getStatContext()
        .games.filter(wasPlayed)
        .map((game) => `${game.year}|${game.week}|${game.matchupId}`)
    );

    for (const entry of computeStat("on-this-day")) {
      const matchupId = entry.href?.split("/").pop();
      expect(real.has(`${entry.year}|${entry.week}|${matchupId}`)).toBe(true);
    }
  });

  it("names both managers and both scores in every entry", () => {
    for (const entry of computeStat("on-this-day")) {
      expect(entry.subject).toBeTruthy();
      expect(entry.href).toMatch(/^\/seasons\/\d{4}\/matchups\/\d+\/\d+$/);
      // Two scores, to two decimal places, either side of an en dash.
      expect(entry.detail).toMatch(/\d+\.\d{2}–\d+\.\d{2}/);
      expect(entry.detail).toContain(entry.subject);
    }
  });

  it("counts each game once, not once per team", () => {
    const hrefs = computeStat("on-this-day").map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("manager archetypes", () => {
  const gamesFor = (managerId: string) =>
    getStatContext().games.filter(
      (game) => wasPlayed(game) && game.managerId === managerId
    );

  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  /**
   * The measures behind the labels, recomputed here from the game list. If a
   * label's number does not survive an independent count, the label is not
   * backed by anything.
   *
   * Only the labels that can be recounted in a line or two are listed; the
   * rest are covered by the "every label has a number" check.
   */
  const measures: Record<string, (managerId: string) => number> = {
    "The Heartbreaker": (id) =>
      gamesFor(id).filter((g) => g.result === "loss" && Math.abs(g.margin) < 5)
        .length,
    "The Cat Burglar": (id) =>
      gamesFor(id).filter((g) => g.result === "win" && g.margin < 5).length,
    "The Bully": (id) =>
      mean(gamesFor(id).filter((g) => g.result === "win").map((g) => g.margin)),
    "The Punchbag": (id) =>
      mean(
        gamesFor(id)
          .filter((g) => g.result === "loss")
          .map((g) => Math.abs(g.margin))
      ),
    "The Machine": (id) => mean(gamesFor(id).map((g) => g.points)),
    "The Anchor": (id) => mean(gamesFor(id).map((g) => g.points)),
    "The Firework": (id) => Math.max(...gamesFor(id).map((g) => g.points)),
    "The Iron Man": (id) => gamesFor(id).length,
  };

  /** The label an entry is wearing, when it is one we can recount. */
  const checkableLabel = (detail: string | undefined): string | undefined =>
    Object.keys(measures).find((label) => detail?.startsWith(`${label} —`));

  it("gives every qualifying manager one label, and a link to their page", () => {
    const entries = computeStat("manager-archetypes");
    expect(entries.length).toBeGreaterThan(8);
    expect(new Set(entries.map((e) => e.subject)).size).toBe(entries.length);

    for (const entry of entries) {
      expect(entry.href).toBe(`/managers/${entry.subject}`);
      expect(entry.detail).toMatch(/^The [A-Z]/);
    }
  });

  it("puts a number in every label's evidence", () => {
    for (const entry of computeStat("manager-archetypes")) {
      expect(
        numbersIn(entry.detail ?? "").length,
        `"${entry.detail}" has no number behind it`
      ).toBeGreaterThan(0);
    }
  });

  it("backs each label with the number it was chosen on", () => {
    let verified = 0;

    for (const entry of computeStat("manager-archetypes")) {
      const label = checkableLabel(entry.detail);
      if (!label) continue;

      const expected = measures[label](entry.subject);
      const shown = numbersIn(entry.detail ?? "");

      // The measure, formatted as the module formats it, has to be one of the
      // numbers in the line: counts are whole, the rest go to one or two
      // decimal places.
      const candidates = [
        Math.round(expected),
        Number(expected.toFixed(1)),
        Number(expected.toFixed(2)),
      ];

      expect(
        shown.some((value) => candidates.includes(value)),
        `${entry.subject}: "${entry.detail}" does not contain ${expected}`
      ).toBe(true);
      verified += 1;
    }

    // If assignment ever stops handing out any of the recountable labels, this
    // test has quietly stopped testing anything.
    expect(verified).toBeGreaterThanOrEqual(3);
  });

  it("only claims to lead the league when it actually does", () => {
    const entries = computeStat("manager-archetypes");

    // Phrases a label uses when it is top of its measure. "The Anchor" leads
    // on the *lowest* average, so its ordering is inverted and the shared
    // measure cannot rank it; it is left out.
    const topClaims = [
      "most in the league",
      "the largest in the league",
      "the highest average in the league",
      "more than anyone else",
    ];

    for (const entry of entries) {
      const label = checkableLabel(entry.detail);
      if (!label || label === "The Anchor") continue;
      if (!topClaims.some((claim) => entry.detail?.includes(claim))) continue;

      const mine = measures[label](entry.subject);
      const better = entries
        .filter((other) => other.subject !== entry.subject)
        .filter((other) => measures[label](other.subject) > mine + 1e-9)
        .map((other) => other.subject);

      expect(better, `${entry.subject} claims to lead "${label}"`).toEqual([]);
    }
  });
});

describe("championship inevitability", () => {
  it("has one entry per completed title, earliest-settled first", () => {
    const entries = computeStat("championship-inevitability");
    expect(entries.length).toBeGreaterThan(10);

    const years = entries.map((entry) => entry.year);
    expect(new Set(years).size).toBe(years.length);

    const values = entries.map((entry) => entry.value);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it("points at a real matchup and names a manager who played that season", () => {
    const { games } = getStatContext();

    for (const entry of computeStat("championship-inevitability")) {
      expect(entry.subject).toBeTruthy();
      expect(entry.href).toMatch(/^\/seasons\/\d{4}\//);
      expect(entry.detail).toContain(String(entry.year));
      expect(entry.detail).toContain(entry.subject);

      const theirs = games.filter(
        (game) => game.year === entry.year && game.managerId === entry.subject
      );
      expect(theirs.length, `${entry.subject} in ${entry.year}`).toBeGreaterThan(0);
    }
  });
});
