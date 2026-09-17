import { describe, expect, it } from "vitest";
import {
  normalisedFinish,
  sparklinePoints,
  toCareerShape,
} from "../CareerSparkline/useCareerSparkline";
import type { RibbonPoint, RibbonSeries } from "../PowerRibbon/usePowerRibbon";

const at = (year: number, position: number, field = 12): RibbonPoint => ({
  year,
  position,
  field,
  provisional: false,
});

const inProgress = (year: number, position: number): RibbonPoint => ({
  ...at(year, position),
  provisional: true,
});

const series = (points: (RibbonPoint | null)[]): RibbonSeries => ({
  managerId: "rich",
  name: "rich",
  points,
  seasonsPlayed: points.filter(Boolean).length,
  titles: points.filter((p) => p && p.position === 1 && !p.provisional).length,
  bestFinish: null,
});

describe("normalisedFinish", () => {
  it("puts the champion at 1 and the wooden spoon at 0", () => {
    expect(normalisedFinish(1, 12)).toBe(1);
    expect(normalisedFinish(12, 12)).toBe(0);
  });

  /**
   * The reason this function exists. The league was ten teams until 2014 and
   * twelve after, so the same raw position is a different season either side of
   * the change — drawn at the same height, a career looks flat across a year it
   * actually got worse in.
   */
  it("makes finishes comparable across a change in field size", () => {
    // Dead centre of the field is the same height whatever the field size —
    // 5.5th of ten and 6.5th of twelve are both exactly mid-table.
    expect(normalisedFinish(5.5, 10)).toBeCloseTo(0.5, 10);
    expect(normalisedFinish(6.5, 12)).toBeCloseTo(0.5, 10);
    // And so eighth of ten is a worse season than eighth of twelve, which is
    // the case that matters: the league went from ten teams to twelve in 2014.
    expect(normalisedFinish(8, 10)).toBeLessThan(normalisedFinish(8, 12));
  });

  it("does not divide by zero on a degenerate field", () => {
    expect(normalisedFinish(1, 1)).toBe(1);
    expect(normalisedFinish(1, 0)).toBe(1);
  });
});

describe("toCareerShape", () => {
  /**
   * The bug this was written for: in September a manager with no trophies at
   * all sits top of the table on two results, and the card read "No titles
   * yet · best 1st" — contradicting itself in two lines.
   */
  it("does not count a season still being played as a career best", () => {
    const shape = toCareerShape(
      series([at(2024, 9), at(2025, 6), inProgress(2026, 1)])
    );
    expect(shape.bestFinish).toBe(6);
    expect(shape.worstFinish).toBe(9);
    // It is still the "now", though — that is what the last point is for.
    expect(shape.latest).toEqual(inProgress(2026, 1));
  });

  it("has no best finish at all until a season has settled", () => {
    const shape = toCareerShape(series([null, null, inProgress(2026, 1)]));
    expect(shape.bestFinish).toBeNull();
    expect(shape.worstFinish).toBeNull();
    expect(shape.latest?.year).toBe(2026);
  });

  it("takes the newest season played, not the newest season there is", () => {
    const shape = toCareerShape(series([at(2012, 4), at(2013, 2), null, null]));
    expect(shape.latest?.year).toBe(2013);
  });
});

describe("sparklinePoints", () => {
  it("spans the full width, first season to last", () => {
    const points = sparklinePoints([at(2012, 1), at(2013, 6), at(2014, 12)], 100, 30);
    expect(points.map((p) => p?.x)).toEqual([0, 50, 100]);
  });

  it("inverts y, so the champion is at the top", () => {
    const [champion, spoon] = sparklinePoints([at(2012, 1), at(2013, 12)], 100, 30);
    expect(champion?.y).toBe(0);
    expect(spoon?.y).toBe(30);
  });

  /**
   * `linePath` reads a null as a pen lift. A manager who played 2012-13, left,
   * and came back in 2015 must show a gap — a straight line across 2014 would
   * claim a season they were not in the league for.
   */
  it("keeps a null for every season the manager sat out", () => {
    const points = sparklinePoints([at(2012, 3), null, at(2014, 5)], 100, 30);
    expect(points[1]).toBeNull();
    expect(points[0]).not.toBeNull();
    expect(points[2]).not.toBeNull();
  });

  it("centres a single season rather than pinning it to the left edge", () => {
    expect(sparklinePoints([at(2012, 4)], 100, 30)[0]?.x).toBe(50);
  });
});
