/**
 * The number a record card is allowed to lead with (E7 + G2).
 *
 * `recordBrokenCard` puts one number at 176px in the middle of the card and
 * the sentence above it. That only works when the stat's `value` IS the
 * magnitude the sentence is about — and for four of the twenty-five it is not:
 *
 * | Stat | Its `value` | What a card would say |
 * | --- | --- | --- |
 * | `on-this-day` | `2025` — a year | "CHUMBO RECORD · 2025" |
 * | `championship-inevitability` | `1` — a week number | "CHUMBO RECORD · 1" |
 * | `manager-archetypes` | `2.55` — a distinctiveness score | a number with no unit anyone knows |
 * | `beat-almost-everyone` | `10` — opponents outscored | reads as ten of what? |
 *
 * So this is an allowlist rather than a denylist, and that is the deliberate
 * bit: a stat added later gets **no** share button until somebody decides its
 * number reads as a record. `phrases.ts` can afford to fall back to a clumsy
 * label because a clumsy sentence is still true; a card that leads with a year
 * under the words "CHUMBO RECORD" is not, and this is the one place in the
 * narrative engine where silence is the safe default.
 *
 * No unit is appended. The sentence directly above the number says what it is
 * ("The biggest margin of victory in Chumbo history"), so "125.98 pts" would
 * be saying it twice and would cost the number font size.
 */

import type { StatFormat } from "@/utils/stats/types";

export const RECORD_VALUE_STATS = new Set([
  "biggest-margin",
  "closest-margin",
  "highest-scoring-loss",
  "lowest-scoring-win",
  "longest-win-streak",
  "longest-loss-streak",
  "rivalry-intensity",
  "revenge-games",
  "bench-points",
  "bench-points-season",
  "manager-efficiency",
  "worst-start-sit",
  "bench-bandit",
  "best-draft-picks",
  "worst-draft-picks",
  "draft-position-luck",
  "most-drafted-players",
  "one-that-got-away",
  "trade-ledger",
  "waiver-hit-rate",
  "roster-churn",
  "biggest-comeback",
  "monday-night-wins",
  "most-points-season",
  "career-points",
  "career-wins",
  // `latest-decisive-play` is deliberately absent: its value is minutes since
  // Thursday morning, so a card would lead with "6,942" under the words
  // CHUMBO RECORD. Its magnitude is a time, and the detail says it.
]);

/**
 * Thousands separated by hand, for the reason `formatPoints` gives in
 * `ShareCard/templates/chrome.ts`: `toLocaleString` follows the host locale,
 * so the same fact would render "2,949.3" in a browser and "2.949,3" in a
 * German CI container building the OG images.
 */
const groupThousands = (digits: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const withGrouping = (whole: string): string => {
  const negative = whole.startsWith("-");
  return `${negative ? "-" : ""}${groupThousands(
    negative ? whole.slice(1) : whole
  )}`;
};

/**
 * Two decimals, trailing zeros dropped.
 *
 * NOT `formatPoints`, which is fixed at one decimal. The narrowest win in
 * league history is 0.04 points, and one decimal renders the record as "0.0" —
 * a card whose whole subject is the number would be printing a zero.
 */
const asPoints = (value: number): string => {
  const [whole, fraction] = value.toFixed(2).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${withGrouping(whole)}${trimmed ? `.${trimmed}` : ""}`;
};

/** Already a percentage in the file (71.43, not 0.7143). */
const asPercent = (value: number): string =>
  `${asPoints(Number(value.toFixed(1)))}%`;

const asCount = (value: number): string =>
  withGrouping(String(Math.round(value)));

/** The stat's number, formatted the way that stat's page formats it. */
export const formatStatValue = (value: number, format: StatFormat): string => {
  if (!Number.isFinite(value)) return "—";
  if (format === "percent") return asPercent(value);
  if (format === "count") return asCount(value);
  // "points" and "record" both come through as a magnitude; no stat uses
  // "record" today, and a W–L pair could not be the hero of this card anyway.
  return asPoints(value);
};

/**
 * The number, or undefined when this stat's number is not one a record card
 * may lead with. Undefined is the signal to show no share button at all.
 */
export const recordValueFor = (
  statId: string,
  value: number,
  format: StatFormat
): string | undefined =>
  RECORD_VALUE_STATS.has(statId) ? formatStatValue(value, format) : undefined;
