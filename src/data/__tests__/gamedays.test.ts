import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import type { GamedayFile } from "@/data/gamedays";
import { PINNED_THROUGH } from "@/utils/__tests__/helpers";
import { isWeekCompleted } from "@/utils/weekUtils";

/**
 * The committed box scores (L1).
 *
 * The raw play-by-play they came from is never committed, so these files are
 * checked on their own terms: that each is about the players Chumbo rostered
 * that week, and that a skill player's line adds back up to Sleeper's points.
 * That second one is the builder's own check, redone from the output — if a
 * later edit to `scripts/build-gamedays.js` miscounted a stat, the lines would
 * stop adding up here, on every machine, without anyone downloading 250 MB.
 */

const files = import.meta.glob<GamedayFile>("../*/gamedays/*.json", {
  eager: true,
  import: "default",
});

const weekFile = (year: number, week: number) =>
  files[`../${year}/gamedays/${week}.json`];

const sides = (year: number, week: number) =>
  (seasons[year].matchups as Record<string, typeof seasons[number]["matchups"]["1"]>)[
    String(week)
  ] ?? [];

/** 2012-16 scored a returner nothing for a return TD — see the builder. */
const returnTd = (year: number) => (year <= 2016 ? 0 : 6);

/** Points from the line alone. Every season scores skill players the same. */
const skillPoints = (s: Record<string, number>, year: number) =>
  (s.pYd ?? 0) * 0.04 +
  (s.pTd ?? 0) * 4 +
  (s.int ?? 0) * -2 +
  (s.rYd ?? 0) * 0.1 +
  (s.rTd ?? 0) * 6 +
  (s.reYd ?? 0) * 0.1 +
  (s.reTd ?? 0) * 6 +
  (s.fl ?? 0) * -2 +
  (s["2pt"] ?? 0) * 2 +
  (s.stTd ?? 0) * returnTd(year);

const finished = YEAR_NUMBERS.filter((year) => year <= PINNED_THROUGH);

describe("the box scores", () => {
  it("cover every played week of every finished season", () => {
    const missing = finished.flatMap((year) =>
      Object.keys(seasons[year].matchups ?? {})
        .map(Number)
        .filter((week) => week <= 17 && isWeekCompleted(week, seasons[year].league))
        .filter((week) => sides(year, week).some((s) => (s.points ?? 0) > 0))
        .filter((week) => !weekFile(year, week))
        .map((week) => `${year} week ${week}`)
    );
    expect(missing).toEqual([]);
  });

  it("are only about players on a Chumbo roster that week", () => {
    for (const [file, gameday] of Object.entries(files)) {
      const [, year, week] = file.match(/\/(\d{4})\/gamedays\/(\d+)\.json$/)!;
      const rostered = new Set(
        sides(Number(year), Number(week)).flatMap((s) => (s.players ?? []).map(String))
      );
      for (const [playerId, line] of Object.entries(gameday.players)) {
        expect(rostered.has(playerId), `${file} ${playerId}`).toBe(true);
        expect(line.t, `${file} ${playerId}`).toMatch(/^[A-Z]{2,3}$|^$/);
      }
    }
  });

  it("add back up to Sleeper's points for the skill players who started", () => {
    // L1 measured 99.8% exact across 2012-2025. The misses are Sleeper's stat
    // corrections, the 2022 Bills-Bengals game the NFL abandoned, and 2019's
    // reconstructed lineups — a handful a season, never a broken join.
    let starters = 0;
    let exact = 0;
    for (const year of finished) {
      for (const [file, gameday] of Object.entries(files)) {
        const match = file.match(/\/(\d{4})\/gamedays\/(\d+)\.json$/)!;
        if (Number(match[1]) !== year) continue;
        for (const side of sides(year, Number(match[2]))) {
          (side.starters ?? []).forEach((playerId, index) => {
            const pid = String(playerId);
            if (pid === "0" || /^[A-Z]{2,3}$/.test(pid)) return; // D/ST
            const line = gameday.players[pid];
            if (line?.s.fgAtt || line?.s.xpAtt) return; // kickers score by distance
            const official = side.starters_points?.[index] ?? 0;
            const rebuilt = line ? skillPoints(line.s, year) : 0;
            starters++;
            if (Math.abs(rebuilt - official) < 0.05) exact++;
          });
        }
      }
    }
    expect(starters).toBeGreaterThan(15000);
    expect(exact / starters).toBeGreaterThan(0.995);
  });
});
