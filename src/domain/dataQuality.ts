/**
 * Seasons whose lineup-level data is known to be approximate.
 *
 * 2012-2019 were played on NFL.com and scraped into Sleeper's shape. For 2019
 * specifically, the original scrape was later replaced with data re-entered by
 * hand into Sleeper, and the per-player scores did not survive intact:
 *
 *   - 28 starters had no score at all: waiver pickups that never reached the
 *     Sleeper rosters, which were rebuilt from draft and trades only. Their
 *     score has been restored from the gap between the lineup and the recorded
 *     team total, but it is inferred, not recorded.
 *   - 33 team-weeks were short or long purely through scoring drift
 *     (`st_fum_rec` 2 -> 0, `def_kr_td` / `def_pr_td` 6 -> 0, while
 *     `def_st_fum_rec` stayed at 2). All of it is defensive, so the difference
 *     was folded back into the starting defence's score.
 *   - 4 team-weeks remain unattributed and still carry a `points_adjustment`.
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
