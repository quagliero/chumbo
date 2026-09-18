import { seasons } from "@/data";
import { ExtendedRoster } from "@/types/roster";
import { getSeasonBreakdown } from "@/utils/seasonBreakdown";

/**
 * Who the season's award cards name, and the line under the champion. Moved
 * out of `Standings.tsx` as it was; see `standingsData.ts`.
 */

// Get top scorer
export const getTopScorer = (standings: ExtendedRoster[]) =>
  standings.reduce((max, r) => {
    const rPoints = r.settings.fpts + r.settings.fpts_decimal / 100;
    const maxPoints = max.settings.fpts + max.settings.fpts_decimal / 100;
    return rPoints > maxPoints ? r : max;
  });

// Get bottom scorer
export const getBottomScorer = (standings: ExtendedRoster[]) =>
  standings.reduce((min, r) => {
    const rPoints = r.settings.fpts + r.settings.fpts_decimal / 100;
    const minPoints = min.settings.fpts + min.settings.fpts_decimal / 100;
    return rPoints < minPoints ? r : min;
  });

// The Scumbo: the worst BREAKDOWN of the season.
//
// Comes from the shared `getSeasonBreakdown` rather than a local sum, so this
// card and the Hall of Fame's Ring of Shame cannot name different people —
// which they did. The local version counted EVERY week in `matchups`,
// playoffs included, and that is not an all-play record: in a playoff week the
// consolation bracket is being compared against the championship bracket and
// the league is no longer playing a common schedule. It changed the holder in
// two of fourteen seasons (2013 and 2023, htc rather than kitch).
//
// Regular season only is also what the Breakdown tab shows, and "breakdown"
// is the word the league uses for this award.
export const getScumbo = (
  currentYear: number | undefined,
  standings: ExtendedRoster[]
) => {
  const breakdown = currentYear ? getSeasonBreakdown(currentYear) : [];
  const worstBreakdown = breakdown[breakdown.length - 1];
  return worstBreakdown
    ? {
        roster: standings.find((r) => r.roster_id === worstBreakdown.rosterId),
        leagueWins: worstBreakdown.wins,
        leagueLosses: worstBreakdown.losses,
        leagueTies: worstBreakdown.ties,
      }
    : null;
};

/**
 * The line under the champion's name: "First win", or which win this is and
 * the years of the ones before it. Counts titles up to and including the
 * season being viewed, so an old season reads as it did at the time.
 */
export const getChampionshipHistory = (
  championRoster: ExtendedRoster | undefined,
  currentYear: number | undefined
) => {
  if (!championRoster) return null;

  const allChampionships = Object.entries(seasons)
    .filter(([year, season]) => {
      const yearNum = parseInt(year);
      // Only include years up to and including the current year
      return (
        season?.winners_bracket &&
        (!currentYear || yearNum <= currentYear)
      );
    })
    .map(([year, season]) => {
      const championship = season.winners_bracket.find(
        (m) => m.p === 1
      );
      if (!championship) return null;

      // Find the roster that won the championship
      const winningRoster = season.rosters?.find(
        (r) => r.roster_id === championship.w
      );

      return winningRoster
        ? {
            year: parseInt(year),
            ownerId: winningRoster.owner_id,
          }
        : null;
    })
    .filter(Boolean);

  const thisManagerChampionships = allChampionships
    .filter(
      (champ) => champ?.ownerId === championRoster.owner_id
    )
    .map((champ) => champ!.year)
    .sort((a, b) => a - b);

  const previousYears = thisManagerChampionships.filter(
    (year) => year !== currentYear
  );
  const winCount = thisManagerChampionships.length;

  if (winCount === 1) {
    return "First win";
  } else if (winCount === 2) {
    return `Second win (${previousYears.join(", ")})`;
  } else if (winCount === 3) {
    return `Third win (${previousYears.join(", ")})`;
  } else {
    return `${winCount}th win (${previousYears.join(", ")})`;
  }
};
