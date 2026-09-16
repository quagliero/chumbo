/**
 * Seasons whose lineup-level data is known to be approximate.
 *
 * 2012-2019 were played on NFL.com and scraped into Sleeper's shape. For 2019
 * specifically, the original scrape was later replaced with data re-entered by
 * hand into Sleeper, and the per-player scores did not survive intact:
 *
 *   - 65 of 184 team-weeks carry a `points_adjustment`, because the recorded
 *     NFL.com score is higher or lower than the sum of the lineup we still have.
 *   - Some starters have no score at all (they were never on the Sleeper roster),
 *     and the season's defensive scoring config drifted (`st_fum_rec` 2 -> 0,
 *     `def_kr_td` / `def_pr_td` 6 -> 0, while `def_st_fum_rec` stayed at 2).
 *
 * Team scores, records, standings and head-to-head are CORRECT for 2019 - they
 * come from the NFL.com record and reconcile exactly. It is only the per-player
 * breakdown that is incomplete.
 *
 * So: anything derived from individual lineup slots - optimal lineup, points left
 * on the bench, manager efficiency, best/worst start-sit - should exclude these
 * seasons rather than let an incomplete reconstruction win a league record.
 *
 * See scripts/rebuild-2019.js and BUILD_PLAN.md task H8.
 */
export const APPROXIMATE_LINEUP_SEASONS: readonly number[] = [2019];

/** True when `year`'s per-player scoring is incomplete (see above). */
export const hasApproximateLineups = (year: number): boolean =>
  APPROXIMATE_LINEUP_SEASONS.includes(year);
