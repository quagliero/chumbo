import { describe, expect, it } from "vitest";
import { loadAllSeasons } from "@/data";
import { computeStat, getStatContext } from "@/utils/stats";
import type { Game } from "@/utils/stats";

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
  it("files every game under a real calendar day", () => {
    const entries = computeStat("on-this-day");
    expect(entries.length).toBeGreaterThan(300);
    for (const entry of entries) {
      const month = Math.floor(entry.value / 100);
      const day = entry.value % 100;
      // The season runs September to January, and the odd game into early
      // February is still inside it.
      expect([1, 2, 9, 10, 11, 12], `${entry.value}`).toContain(month);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    }
  });

  it("keeps one game per season per day", () => {
    const keys = computeStat("on-this-day").map((entry) => `${entry.year}|${entry.value}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts 2020 week 12 on the Wednesday its last game was played", () => {
    // Ravens–Steelers, moved by COVID to the afternoon of Wednesday 2 December.
    // Five of that week's six games waited for it; the sixth, with nobody in
    // it, was over on Monday night.
    const week12 = computeStat("on-this-day").filter(
      (entry) => entry.year === 2020 && entry.week === 12
    );
    expect(week12.map((entry) => entry.value).sort()).toEqual([1130, 1202]);
  });

  it("puts a game that ran past midnight on the night it started", () => {
    // 2013 week 1's Monday doubleheader ended after 1am Eastern on Tuesday; the
    // games it settled were over on Monday 9 September.
    const week1 = computeStat("on-this-day").filter(
      (entry) => entry.year === 2013 && entry.week === 1
    );
    expect(week1.map((entry) => entry.value)).not.toContain(910);
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

  it("marks 2019, whose lineups — and so whose finishing times — are inferred", () => {
    const from2019 = computeStat("on-this-day").filter((entry) => entry.year === 2019);
    expect(from2019.length).toBeGreaterThan(0);
    expect(from2019.every((entry) => entry.approximate)).toBe(true);
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
describe("the coin flip", () => {
  /**
   * Added because htc led nothing and was wearing somebody else's label at
   * rank 2 — "The Firework, 2nd of 14" is a runner-up rosette, not a character.
   *
   * Two things this guards, both of which the first attempt got wrong:
   * the measure must be about being CLOSE TO .500 rather than about having
   * played a lot (weighting by games handed it to rich on 46.8%), and the
   * record it quotes must be the same set of games as the rate beside it (it
   * printed an all-games 108-101 next to a regular-season 50.0%).
   *
   * Nobody may hold it at all unless they are near .500: a live season can
   * move the whole middle of the table, and closest is not the same as close.
   */
  it("goes only to a manager near .500, and its prose adds up", async () => {
    await loadAllSeasons();
    const entry = computeStat("manager-archetypes").find((e) =>
      e.detail?.includes("The Coin Flip")
    );
    if (!entry) return;

    const record = entry!.detail!.match(/(\d+)-(\d+)(?:-(\d+))? across/);
    expect(record).not.toBeNull();
    const [wins, losses, ties] = [record![1], record![2], record![3] ?? "0"].map(Number);

    const rate = Number(entry!.detail!.match(/win rate of ([\d.]+)%/)![1]);
    const games = wins + losses + ties;
    expect(games).toBe(
      Number(entry!.detail!.match(/across (\d+) regular-season games/)![1])
    );
    // The number in the prose has to survive a reader doing the arithmetic.
    expect(((wins + ties / 2) / games) * 100).toBeCloseTo(rate, 1);

    // And it has to actually be near a coin toss, or the label is a lie.
    expect(Math.abs(rate - 50)).toBeLessThan(2);
  });
});
