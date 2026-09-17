import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { CURRENT_YEAR, YEAR_NUMBERS } from "@/domain/constants";
import type { ExtendedMatchup } from "@/types/matchup";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { roundToTwoDecimals } from "@/utils/recordUtils";
import { buildScoreHeatmap } from "../useScoreHeatmap";
import {
  BAND_COUNT,
  BAND_WIDTH,
  SCORE_RAMP,
  bandFloors,
  bandFor,
  bandLabel,
  colourFor,
} from "../scoreScale";

/**
 * D5 has two halves that fail differently.
 *
 * The SCALE fails silently and permanently: a ramp that is not perceptually
 * ordered still draws, still looks like a heatmap, and is simply wrong for
 * every reader — and wrong in a way nobody notices until a colour-blind reader
 * says the chart is meaningless. So the ordering claim is asserted rather than
 * asserted-in-a-comment.
 *
 * The GRID fails plausibly: a cell in the wrong column, or a rank against the
 * wrong field, is perfectly believable data on screen.
 */

// ---------------------------------------------------------------- the scale

/** WCAG relative luminance. Enough to check the ramp is ordered by lightness. */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
};

describe("the score ramp", () => {
  /**
   * The whole claim of a sequential scale. If luminance is not monotonic then
   * the ramp has no order at all in greyscale or to a reader with any form of
   * colour vision deficiency — it is a categorical palette pretending to be a
   * scale.
   */
  it("gets strictly darker, step by step", () => {
    const steps = SCORE_RAMP.map(luminance);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
  });

  /**
   * And by enough to see. Adjacent swatches within a few percent of each other
   * are technically ordered and practically one colour.
   */
  it("separates adjacent steps by a visible amount", () => {
    const steps = SCORE_RAMP.map(luminance);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i - 1] - steps[i]).toBeGreaterThan(0.03);
    }
  });
});

describe("bandFloors", () => {
  it("centres the middle band on the median", () => {
    // Median 95 -> its band floor is 90 -> three bands below it.
    const floors = bandFloors([80, 90, 95, 100, 130]);
    expect(floors).toHaveLength(BAND_COUNT);
    expect(floors[Math.floor(BAND_COUNT / 2)]).toBe(90);
    expect(floors[0]).toBe(90 - 3 * BAND_WIDTH);
  });

  it("steps by exactly one band width", () => {
    const floors = bandFloors([100]);
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i] - floors[i - 1]).toBe(BAND_WIDTH);
    }
  });

  /** It must not sort the caller's array in place — see H6. */
  it("leaves its input alone", () => {
    const scores = [130, 60, 95];
    bandFloors(scores);
    expect(scores).toEqual([130, 60, 95]);
  });

  it("survives a manager with no games at all", () => {
    expect(bandFloors([])).toHaveLength(BAND_COUNT);
  });
});

describe("bandFor", () => {
  const floors = [60, 70, 80, 90, 100, 110, 120];

  it("clamps both ends rather than running off the scale", () => {
    // The two most extreme weeks in league history.
    expect(bandFor(36.9, floors)).toBe(0);
    expect(bandFor(174, floors)).toBe(BAND_COUNT - 1);
  });

  it("puts a score in the band whose floor it sits on", () => {
    expect(bandFor(60, floors)).toBe(0);
    expect(bandFor(69.99, floors)).toBe(0);
    expect(bandFor(70, floors)).toBe(1);
    expect(bandFor(92.8, floors)).toBe(3);
  });

  it("never goes down as the score goes up", () => {
    let previous = -1;
    for (let points = 0; points <= 200; points += 0.5) {
      const band = bandFor(points, floors);
      expect(band).toBeGreaterThanOrEqual(previous);
      previous = band;
    }
  });

  it("gives a colour for every band and open-ended labels at the ends", () => {
    expect(new Set(floors.map((f) => colourFor(f, floors))).size).toBe(
      BAND_COUNT
    );
    expect(bandLabel(0, floors)).toBe("under 70");
    expect(bandLabel(BAND_COUNT - 1, floors)).toBe("120+");
    expect(bandLabel(3, floors)).toBe("90–100");
  });
});

// ----------------------------------------------------------------- the grid

const LONG = buildScoreHeatmap("thd"); // fifteen seasons, 2012-2026
const SHORT = buildScoreHeatmap("karsten"); // one, 2012

describe("buildScoreHeatmap", () => {
  it("returns an empty grid for a manager who does not exist", () => {
    const grid = buildScoreHeatmap("nobody");
    expect(grid.rows).toEqual([]);
    expect(grid.weeks).toEqual([]);
    // Still a usable scale, so the legend does not have to special-case it.
    expect(grid.floors).toHaveLength(BAND_COUNT);
  });

  it("is rectangular, and every cell is in its own column", () => {
    for (const grid of [LONG, SHORT]) {
      expect(grid.rows.length).toBeGreaterThan(0);
      for (const row of grid.rows) {
        expect(row.cells).toHaveLength(grid.weeks.length);
        row.cells.forEach((cell, index) => {
          if (cell) expect(cell.week).toBe(grid.weeks[index]);
        });
      }
    }
  });

  it("covers a one-season career without collapsing", () => {
    // The case a grid or a scale usually breaks on.
    expect(SHORT.rows).toHaveLength(1);
    expect(SHORT.rows[0].year).toBe(2012);
    expect(SHORT.weeks.length).toBeGreaterThan(0);
    expect(SHORT.rows[0].played).toBeGreaterThan(0);
  });

  it("lists seasons oldest first", () => {
    const years = LONG.rows.map((row) => row.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  /**
   * The regular-season rule, asserted rather than trusted. A playoff week
   * sneaking in would bring byes with it — cells with no matchup to link to.
   */
  it("holds regular-season games only", () => {
    for (const row of LONG.rows) {
      const playoffStart = getPlayoffWeekStart(seasons[row.year]);
      for (const cell of row.cells) {
        if (cell) expect(cell.week).toBeLessThan(playoffStart);
      }
    }
  });

  it("gives every cell a matchup to link to", () => {
    for (const row of LONG.rows) {
      for (const cell of row.cells) {
        if (cell) expect(Number.isFinite(cell.matchupId)).toBe(true);
      }
    }
  });

  /**
   * Rank is against the whole league that week, not against the opponent. Get
   * the field wrong and every cell still shows a plausible number.
   */
  it("ranks each score against everyone who played that week", () => {
    for (const row of LONG.rows) {
      for (const cell of row.cells) {
        if (!cell) continue;
        const games = (seasons[cell.year].matchups as Record<
          string,
          ExtendedMatchup[] | undefined
        >)[String(cell.week)];
        const scores = (games ?? []).map((game) =>
          roundToTwoDecimals(game.points)
        );
        expect(cell.field).toBe(scores.length);
        expect(cell.rank).toBe(
          scores.filter((score) => score > cell.points).length + 1
        );
        expect(cell.rank).toBeGreaterThanOrEqual(1);
        expect(cell.rank).toBeLessThanOrEqual(cell.field);
      }
    }
  });

  it("agrees with itself about the best and worst week", () => {
    const all = LONG.rows.flatMap((row) =>
      row.cells.filter((cell) => cell !== null)
    );
    const scores = all.map((cell) => cell!.points);
    expect(LONG.best?.points).toBe(Math.max(...scores));
    expect(LONG.worst?.points).toBe(Math.min(...scores));
  });

  it("summarises each row from the cells it actually holds", () => {
    for (const row of LONG.rows) {
      const played = row.cells.filter((cell) => cell !== null);
      expect(row.played).toBe(played.length);
      const mean =
        played.reduce((total, cell) => total + cell!.points, 0) / played.length;
      expect(row.average).toBeCloseTo(mean, 8);
    }
  });

  /**
   * The season being played is the sharp edge: an unplayed week sits in the
   * data as twelve zeros, and drawing it would paint a row of ice-cold squares
   * for games nobody has played. `countedWeeks` is what keeps them out.
   */
  it("shows only finished weeks of the season in progress", () => {
    const live = LONG.rows.find((row) => row.year === CURRENT_YEAR);
    if (!live) return; // No 2026 row for this manager; nothing to check.
    const scored = seasons[CURRENT_YEAR].league?.settings?.last_scored_leg ?? 0;
    for (const cell of live.cells) {
      if (cell) expect(cell.week).toBeLessThanOrEqual(scored);
    }
    expect(live.cells.every((cell) => cell === null || cell.points > 0)).toBe(
      true
    );
  });

  it("flags the season whose lineups are a reconstruction, and only that one", () => {
    for (const row of LONG.rows) {
      expect(row.approximateLineups).toBe(row.year === 2019);
    }
  });

  /** Every manager's grid should build; a crash on one of them is a page down. */
  it("builds for every season anyone has played", () => {
    const covered = new Set<number>();
    for (const managerId of ["thd", "dix", "karsten", "phil", "jimmie"]) {
      for (const row of buildScoreHeatmap(managerId).rows) covered.add(row.year);
    }
    expect(covered.has(2012)).toBe(true);
    expect(covered.has(2016)).toBe(true);
    expect([...covered].every((year) => YEAR_NUMBERS.includes(year))).toBe(true);
  });
});
