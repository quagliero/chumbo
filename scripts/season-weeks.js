/**
 * Which weeks of a season to fetch, read off Sleeper's league object (J1).
 *
 * The automatic update runs unattended, so it fetches only what Sleeper has
 * finished with. `settings.leg` is the week being played and
 * `settings.last_scored_leg` the last one scored: on the Friday of week 2 they
 * are 2 and 1, and week 2's matchups already hold Thursday night's points.
 * `fetch-latest` takes `leg`, which commits that half-played week; this takes
 * `last_scored_leg`, the same rule the site's `isWeekCompleted` uses.
 *
 * Every scored week is fetched again on every run, not just the newest: that
 * is how Sleeper's mid-week stat corrections arrive, and an unchanged week
 * writes an identical file, so it costs a dozen requests and no commit.
 */

/** The last week Sleeper has scored, or 0 before the first one. */
export function completedWeek(league) {
  const settings = league?.settings ?? {};
  if (settings.last_scored_leg) return settings.last_scored_leg;
  return Math.max(0, (settings.leg ?? 1) - 1);
}

const range = (from, to) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/**
 * @returns the matchup weeks, transaction weeks and whether to fetch the
 *   brackets. Transactions run to the week in progress, because a week's
 *   waivers are processed before it is played; brackets once the regular
 *   season is over, because before that Sleeper has none to give.
 */
export function weeksToFetch(league, year) {
  const completed = completedWeek(league);
  const current = Math.max(completed, league?.settings?.leg ?? 0);
  const playoffWeekStart = league?.settings?.playoff_week_start || 15;

  return {
    completed,
    matchups: range(1, Math.min(completed, 18)),
    // Before 2020 the league lived on NFL.com; Sleeper has no transactions.
    transactions: year >= 2020 ? range(1, Math.min(current, 18)) : [],
    brackets:
      league?.status === "complete" || completed >= playoffWeekStart - 1,
  };
}

/**
 * Refuse a scored week that is not a whole week. Sleeper answers a bad request
 * with a 200 and an empty or zeroed list rather than an error, and a scored
 * week of zeroes would publish a round of 0-0 ties.
 */
export function checkWeek(week, matchups, rosterCount) {
  if (!Array.isArray(matchups) || matchups.length !== rosterCount) {
    throw new Error(
      `Week ${week}: expected ${rosterCount} teams, got ${
        Array.isArray(matchups) ? matchups.length : typeof matchups
      }`
    );
  }
  const total = matchups.reduce((sum, m) => sum + (m.points ?? 0), 0);
  if (!(total > 0)) {
    throw new Error(`Week ${week}: scored, but every team has 0 points`);
  }
}
