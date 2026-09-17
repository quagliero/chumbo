/**
 * Chart scales and path helpers (D0).
 *
 * Deliberately hand-rolled. `d3-scale` plus `d3-shape` is ~15 kB gzip and visx
 * considerably more, against a workstream budget of 40 kB for seven charts —
 * and what those libraries actually give us here is the twenty lines below.
 * Workstream A took the payload from 2.89 MB to 347 kB; spending a third of the
 * chart budget on a linear interpolation would be a poor trade.
 *
 * Everything here is a pure function of numbers, which is the other reason to
 * own it: scale maths is exactly the kind of thing that is easy to get subtly
 * wrong and easy to test.
 */

export type Scale = (value: number) => number;

export interface Domain {
  min: number;
  max: number;
}

/**
 * Map a value from `domain` onto `range`.
 *
 * A zero-width domain (every point the same value, which happens for a manager
 * who drew every week, or a single-season chart) maps to the middle of the
 * range rather than dividing by zero and painting NaN.
 */
export const linearScale = (
  domain: Domain,
  range: readonly [number, number]
): Scale => {
  const span = domain.max - domain.min;
  const [r0, r1] = range;
  if (span === 0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - domain.min) / span) * (r1 - r0);
};

/**
 * Evenly spaced positions for `count` discrete items — weeks, seasons, managers.
 *
 * Returns the CENTRE of each band, which is what a point, a label or a heatmap
 * cell wants. `bandWidth` is the full width of one band, so a bar drawn inside
 * it is `bandWidth - gap` wide and offset by half of that.
 */
export const bandScale = (
  count: number,
  range: readonly [number, number]
): { at: Scale; bandWidth: number } => {
  const [r0, r1] = range;
  const bandWidth = count > 0 ? (r1 - r0) / count : 0;
  return {
    at: (index) => r0 + bandWidth * (index + 0.5),
    bandWidth,
  };
};

/**
 * Round a domain out to human numbers, and the ticks to sit on.
 *
 * An axis running 87.3 to 164.9 with ticks at 87.3, 106.7, 126.1 is unreadable;
 * one running 80 to 180 by 20s is not. Steps are the 1 / 2 / 5 / 10 series,
 * which is what every charting library settles on because those are the numbers
 * people read without doing arithmetic.
 */
export const niceTicks = (
  min: number,
  max: number,
  targetCount = 5
): { domain: Domain; ticks: number[] } => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || targetCount < 1) {
    return { domain: { min: 0, max: 0 }, ticks: [] };
  }
  if (min === max) {
    // A flat series still needs an axis. Give it one tick and a domain with
    // width, so the line lands in the middle rather than on an edge.
    return { domain: { min: min - 1, max: max + 1 }, ticks: [min] };
  }

  const rawStep = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) *
    magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Accumulate by index rather than by repeated addition: 0.1 + 0.1 + 0.1 is
  // not 0.3, and an axis labelled "0.30000000000000004" is a bug report.
  const steps = Math.round((niceMax - niceMin) / step);
  for (let i = 0; i <= steps; i++) {
    ticks.push(Number((niceMin + i * step).toPrecision(12)));
  }

  return { domain: { min: niceMin, max: niceMax }, ticks };
};

/** The min and max of a series, ignoring anything non-finite. */
export const extent = (values: readonly number[]): Domain => {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
};

export interface Point {
  x: number;
  y: number;
}

/**
 * An SVG path through `points`.
 *
 * Straight segments, not a spline: these are discrete weekly observations, and
 * a smoothed curve would invent values between them that the season did not
 * have. A gap (a bye, an unplayed week) is a `null`, which lifts the pen rather
 * than drawing a straight line across the missing weeks as though they were
 * played.
 */
export const linePath = (points: readonly (Point | null)[]): string => {
  let path = "";
  let penDown = false;
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${round(point.x)} ${round(point.y)}`;
    penDown = true;
  }
  return path;
};

/**
 * Two decimals is finer than a device pixel at any size we render, and it keeps
 * the serialised path short — these end up in the DOM, and for G1 in a
 * downloadable SVG.
 */
const round = (value: number) => Math.round(value * 100) / 100;
