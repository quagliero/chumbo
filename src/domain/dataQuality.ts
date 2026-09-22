/**
 * Seasons whose BENCH scores are incomplete. Just the bench.
 *
 * 2012-2019 were played on NFL.com and scraped into Sleeper's shape. For 2019
 * the scrape was later replaced with data re-entered by hand into Sleeper, and
 * `scripts/rebuild-2019.js` put it back together: the NFL.com record for every
 * score, result and starting lineup, with Sleeper's per-player points grafted
 * on. What did not survive is the bench. Waiver pickups never reached the
 * rebuilt rosters, so 65 bench players have no score at all.
 *
 * The starters are right, and that is measured rather than assumed: the NFL's
 * own play-by-play (L1) rebuilds 1,284 of 2019's 1,290 skill-position starts to
 * the hundredth — 99.5%, in line with 2018 and 2020 — against 93.7% of its
 * bench (99.9% either side). The 29 starters whose scores were once inferred
 * from the team total check out against the real box scores.
 *
 * So 2019 is in everything built on scores, results or who started — records,
 * streaks, the play-by-play timelines, On this day — and out of, or marked in,
 * only what reads a bench score:
 *
 *   - `requiresBench` stats sit it out: points left on the bench, efficiency
 *     against the optimal lineup, the worst start/sit, the bench bandit, the
 *     trade ledger and waiver hit rate (a player's points on a roster count his
 *     bench weeks, and 2019's lost waiver pickups are exactly the missing ones).
 *   - `allowsIncompleteBench` stats keep it, marked: the draft stats, which rank
 *     a player's whole season, bench weeks included.
 *
 * See scripts/rebuild-2019.js and BUILD_PLAN.md task H8.
 */
export const INCOMPLETE_BENCH_SEASONS: readonly number[] = [2019];

/** True when `year`'s bench scores are incomplete (see above). */
export const hasIncompleteBench = (year: number): boolean =>
  INCOMPLETE_BENCH_SEASONS.includes(year);
