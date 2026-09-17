/**
 * The statistics behind the score distribution (D4).
 *
 * Pure functions of an array of scores, so the two ways this chart could be
 * quietly wrong — a week landing in the wrong bin, and a spread computed over
 * the wrong denominator — are testable without rendering anything.
 *
 * **What a "score" is here.** One regular-season team-week: what a manager's
 * lineup scored in a week that counted, at Sleeper's own two-decimal
 * precision. Which weeks count is `countedWeeks` (D7's, reused), and the
 * reasoning lives in `useScoreDistribution.ts` — this file just takes the
 * numbers.
 *
 * **Why a histogram and not a violin.** A violin needs a kernel and a
 * bandwidth, and both are choices the data cannot make for you: the same
 * thirteen scores can be drawn as one hump or three, and the reader has no way
 * to tell which they are looking at. Several managers here have only one
 * season — thirteen or fourteen weeks — and a smoothed density over thirteen
 * observations implies a continuity that is entirely the smoother's invention.
 * A histogram with a stated bin width shows exactly what was counted and
 * nothing else. Ten points is the bin, because that is the unit this league
 * already speaks in ("I put up a 120") and it is the same width as D5's
 * heatmap bands, so a bin here and a shade there mean the same thing. The
 * five-point view exists so a reader can check that the shape is not an
 * artefact of the binning, which is the one honest answer to the one real
 * objection to a histogram.
 */

/** A single regular-season team-week, and where it happened. */
export interface ScoredWeek {
  year: number;
  week: number;
  /** Their score, rounded to Sleeper's two decimals. */
  points: number;
  /** For the link out: `/seasons/:year/matchups/:week/:matchupId`. */
  matchupId: number;
}

export interface Spread {
  /** Weeks counted. The denominator for everything else. */
  games: number;
  mean: number;
  /**
   * Standard deviation over `games` — divided by n, NOT by n−1.
   *
   * These scores are not a sample from which we are estimating some hidden
   * true volatility; they are every week the manager actually played, the
   * whole population of the thing being described. Bessel's correction answers
   * a question nobody is asking here, and it would report a spread for a
   * one-week career (dividing by zero) and disagree with the picture the bars
   * draw. It matters most exactly where the sample is smallest: phil's
   * thirteen weeks would read 14.1 instead of 13.6.
   */
  sd: number;
  median: number;
  /** The middle half of their weeks: 25th and 75th percentiles. */
  q1: number;
  q3: number;
  min: number;
  max: number;
}

/**
 * The p-th quantile of an already-sorted array, interpolating between
 * neighbours (the "linear" / R type-7 method, which is what every spreadsheet
 * and `numpy.percentile` do by default).
 *
 * Takes a sorted array rather than sorting one, so `summarise` sorts once for
 * four quantiles — and so this never sorts a caller's array in place, which
 * `purity.test.ts` exists to catch.
 */
export const quantile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * p;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
};

/** Mean, spread and the quartiles of a set of scores. */
export const summarise = (points: readonly number[]): Spread => {
  const finite = points.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return { games: 0, mean: 0, sd: 0, median: 0, q1: 0, q3: 0, min: 0, max: 0 };
  }

  const games = finite.length;
  const mean = finite.reduce((total, value) => total + value, 0) / games;
  const variance =
    finite.reduce((total, value) => total + (value - mean) ** 2, 0) / games;
  const sorted = [...finite].sort((a, b) => a - b);

  return {
    games,
    mean,
    sd: Math.sqrt(variance),
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[games - 1],
  };
};

export interface Bin {
  /** Lower edge, inclusive. The bin covers `[floor, floor + width)`. */
  floor: number;
  count: number;
  /** `count / games`, so panels with 13 and 190 weeks are comparable. */
  share: number;
}

/**
 * The bin floors a set of scores needs, rounded out to whole bins.
 *
 * Derived from the WHOLE league rather than from one manager, by the caller
 * passing the league's range: every panel must share one horizontal axis or
 * the small multiples compare nothing. A manager whose worst week was 66 gets
 * the same empty space at the left as everyone else, and that space is the
 * point — it is where other managers' disasters are.
 */
export const binFloors = (
  min: number,
  max: number,
  width: number
): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || width <= 0) return [];
  const first = Math.floor(min / width) * width;
  const last = Math.floor(max / width) * width;
  const count = Math.round((last - first) / width) + 1;
  return Array.from({ length: count }, (_, index) => first + index * width);
};

/**
 * Count scores into bins.
 *
 * Left-closed, right-open: a score of exactly 100.0 is in the 100–110 bin, not
 * the 90–100 one. Anything outside the floors clamps into the end bin rather
 * than being dropped — the floors come from the league's own range so this
 * should never happen, but a dropped week would make the shares stop summing
 * to one and nothing on screen would say so.
 */
export const binScores = (
  points: readonly number[],
  floors: readonly number[],
  width: number
): Bin[] => {
  const counts = new Array<number>(floors.length).fill(0);
  let total = 0;

  for (const value of points) {
    if (!Number.isFinite(value) || floors.length === 0) continue;
    const raw = Math.floor((value - floors[0]) / width);
    counts[Math.max(0, Math.min(floors.length - 1, raw))] += 1;
    total += 1;
  }

  return floors.map((floor, index) => ({
    floor,
    count: counts[index],
    share: total > 0 ? counts[index] / total : 0,
  }));
};
