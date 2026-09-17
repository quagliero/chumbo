import { describe, expect, it } from "vitest";
import {
  bandScale,
  extent,
  linePath,
  linearScale,
  niceTicks,
} from "../scale";

/**
 * D0: the scales are hand-rolled instead of pulled from d3, so they carry the
 * tests d3 would have come with. Every case here is one a chart in workstream D
 * will actually hit — a manager who drew every week, a season with one game
 * played, a bye in the middle of a line.
 */

describe("linearScale", () => {
  it("maps the domain onto the range", () => {
    const scale = linearScale({ min: 0, max: 100 }, [0, 200]);
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(100);
    expect(scale(100)).toBe(200);
  });

  it("inverts for a descending range, which is what SVG y needs", () => {
    // SVG y grows downward, so a chart's y scale runs [height, 0].
    const y = linearScale({ min: 0, max: 10 }, [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(10)).toBe(0);
    expect(y(5)).toBe(50);
  });

  it("extrapolates outside the domain rather than clamping", () => {
    // A line that briefly leaves a fixed domain should leave the plot, not
    // flatten against its edge and imply a value it did not have.
    const scale = linearScale({ min: 0, max: 10 }, [0, 100]);
    expect(scale(15)).toBe(150);
    expect(scale(-5)).toBe(-50);
  });

  it("centres a zero-width domain instead of dividing by zero", () => {
    const scale = linearScale({ min: 7, max: 7 }, [0, 100]);
    expect(scale(7)).toBe(50);
    expect(Number.isNaN(scale(7))).toBe(false);
  });
});

describe("bandScale", () => {
  it("centres each band", () => {
    const { at, bandWidth } = bandScale(4, [0, 100]);
    expect(bandWidth).toBe(25);
    expect(at(0)).toBe(12.5);
    expect(at(3)).toBe(87.5);
  });

  it("survives an empty series", () => {
    const { at, bandWidth } = bandScale(0, [0, 100]);
    expect(bandWidth).toBe(0);
    expect(Number.isNaN(at(0))).toBe(false);
  });
});

describe("niceTicks", () => {
  it("rounds to numbers a reader does not have to decode", () => {
    const { domain, ticks } = niceTicks(87.3, 164.9, 5);
    expect(domain.min).toBeLessThanOrEqual(87.3);
    expect(domain.max).toBeGreaterThanOrEqual(164.9);
    for (const tick of ticks) expect(tick % 20).toBe(0);
  });

  it("uses the 1/2/5/10 step series", () => {
    const steps = new Set<number>();
    for (let max = 3; max < 400; max += 7) {
      const { ticks } = niceTicks(0, max, 5);
      if (ticks.length > 1) steps.add(Number((ticks[1] - ticks[0]).toPrecision(6)));
    }
    for (const step of steps) {
      const normalised = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5, 10]).toContain(Math.round(normalised));
    }
  });

  it("never emits floating point noise as a label", () => {
    const { ticks } = niceTicks(0, 1, 10);
    for (const tick of ticks) {
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
  });

  it("gives a flat series a usable axis", () => {
    const { domain, ticks } = niceTicks(5, 5);
    expect(ticks).toEqual([5]);
    expect(domain.max).toBeGreaterThan(domain.min);
  });

  it("returns nothing for a domain that is not a number", () => {
    expect(niceTicks(NaN, 10).ticks).toEqual([]);
  });
});

describe("extent", () => {
  it("ignores non-finite values rather than poisoning the domain", () => {
    expect(extent([3, NaN, 1, Infinity, 9])).toEqual({ min: 1, max: 9 });
  });

  it("returns a zero domain for nothing at all", () => {
    expect(extent([])).toEqual({ min: 0, max: 0 });
  });
});

describe("linePath", () => {
  it("draws through the points", () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0 0L10 5");
  });

  it("lifts the pen over a gap instead of drawing across it", () => {
    // A bye week is not a straight line between the weeks either side of it.
    const path = linePath([{ x: 0, y: 0 }, null, { x: 20, y: 5 }]);
    expect(path).toBe("M0 0M20 5");
    expect(path).not.toContain("L");
  });

  it("rounds to two decimals to keep the serialised path short", () => {
    expect(linePath([{ x: 1 / 3, y: 2 / 3 }])).toBe("M0.33 0.67");
  });
});
