/**
 * The sequential colour scale for the weekly score heatmap (D5).
 *
 * **The design tokens did not cover this.** `tailwind.config.js` carries the
 * eight-slot categorical palette (`series-1..8`), three result colours and four
 * ordinal bands; none of them is a sequential ramp, and F2's note in
 * `src/domain/managerColors.ts` is entirely about telling *identity* apart,
 * which is the opposite problem. So one is defined here, and the rules it had
 * to satisfy are written down because the obvious choices all fail them.
 *
 * NOT red-to-green. A diverging warm/cool ramp reads as bad-to-good, and a
 * weekly score is not a verdict — 84 points is a poor week or a fine one
 * depending entirely on what the other eleven managers did that week, and the
 * chart has no business deciding which. It is also the single worst pair for a
 * red-green colour blind reader, who would see the top and bottom of the scale
 * as the same colour.
 *
 * NOT a multi-hue ramp (viridis and friends). Those work, but they introduce a
 * fourth colour family to a page that already carries the manager accent, the
 * result colours and the neutrals, and nothing here needs the extra resolution.
 *
 * So: **one hue, monotonically darker.** Hue 280° in CIELCh, which is where
 * `series-1` (#2a78d6, L* 50 C 56 h 280) and the whole neutral family
 * (`ink` h 277, `surface-sunk` h 277) already sit, so the ramp is the palette's
 * own blue rather than a new colour. Lightness runs L* 89 → 33 in steps of
 * 8–10, comfortably above the ~5 ΔL* at which adjacent swatches stop being
 * separable. Because only lightness and chroma vary and hue is constant, the
 * ORDER survives every form of colour vision deficiency and greyscale printing:
 * there is no hue judgement to get wrong. Relative luminance is strictly
 * decreasing down the ramp, which is the machine-checkable version of that
 * claim, and `scoreHeatmap.test.ts` asserts it.
 *
 * Darker = more, the near-universal convention for a sequential heatmap and the
 * one people read without consulting the legend.
 */

/** Seven steps, lightest first. Generated in CIELCh at h 280°; see above. */
export const SCORE_RAMP = [
  "#d9dff4", // L* 88.9
  "#bbc9f0", // L* 81.1
  "#98b0e8", // L* 71.9
  "#7198e2", // L* 62.9
  "#387fd9", // L* 53.0
  "#0067c0", // L* 43.5
  "#004e96", // L* 33.2
] as const;

/** How many bands the ramp has. */
export const BAND_COUNT = SCORE_RAMP.length;

/**
 * Band width, in fantasy points.
 *
 * Ten, because that is the unit this league already talks in — "I put up a
 * 120" — so a reader can convert a shade back into a number without consulting
 * the legend twice. A season's scores have a standard deviation of about 21
 * points, so a band is roughly half a standard deviation: fine enough to show a
 * hot streak, coarse enough that two adjacent weeks are not different colours
 * for the sake of 0.4 of a point.
 */
export const BAND_WIDTH = 10;

/**
 * Where the bands start, given the league's own scoring.
 *
 * Derived rather than hardcoded, but derived from the WHOLE league rather than
 * from the manager on screen — otherwise the same shade would mean 80 points on
 * one manager's page and 110 on another's, and the chart would be useless for
 * the only comparison anybody actually wants to make.
 *
 * The middle band is the one containing the league's median week, so the ramp
 * is centred on what a normal week really is. With fifteen seasons in hand the
 * median is 92.8, which puts the floors at 60, 70 … 120: about 4% of weeks
 * clamp into the bottom band and about 5% into the top, so both ends of the
 * ramp get used without either being crowded.
 *
 * Scoring here has been remarkably stable — every season's mean sits between
 * 88.7 and 97.6 and every standard deviation between 19 and 23 — which is the
 * reason one scale can honestly span 2012 to 2026 at all. Were the league to
 * change its scoring rules, this moves with it rather than needing to be found
 * and edited.
 */
export const bandFloors = (scores: readonly number[]): number[] => {
  const middle = Math.floor(median(scores) / BAND_WIDTH) * BAND_WIDTH;
  // Three bands below the median's band and three above it.
  const first = middle - BAND_WIDTH * Math.floor((BAND_COUNT - 1) / 2);
  return Array.from({ length: BAND_COUNT }, (_, i) => first + i * BAND_WIDTH);
};

/**
 * Which band a score falls in, 0 (coldest) to `BAND_COUNT - 1`.
 *
 * Clamped at both ends: a 174-point week and a 37-point week are the two most
 * extreme in league history and both should read as extremes, rather than as
 * colours off the end of the scale.
 */
export const bandFor = (points: number, floors: readonly number[]): number => {
  if (!Number.isFinite(points)) return 0;
  const index = Math.floor((points - floors[0]) / BAND_WIDTH);
  return Math.max(0, Math.min(floors.length - 1, index));
};

/** The fill for a score. */
export const colourFor = (points: number, floors: readonly number[]): string =>
  SCORE_RAMP[bandFor(points, floors)];

/**
 * What a band covers, in words, for the legend. The outer two are open-ended,
 * because scores clamp into them.
 */
export const bandLabel = (index: number, floors: readonly number[]): string => {
  if (index <= 0) return `under ${floors[1]}`;
  if (index >= floors.length - 1) return `${floors[index]}+`;
  return `${floors[index]}–${floors[index] + BAND_WIDTH}`;
};

/**
 * The middle value of a series.
 *
 * Its own function chiefly so that `bandFloors` does not sort the caller's
 * array in place — the scores handed to it come straight off the season data,
 * and `purity.test.ts` exists because this codebase has been bitten by exactly
 * that (H6).
 */
const median = (values: readonly number[]): number => {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};
