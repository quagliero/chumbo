/**
 * The player page's rail (E2).
 *
 * "Drafted 7 times by 4 managers" and "best week: 41.2 for thd, 2019 W8" — the
 * two facts about a player that are worth a click and are not visible from the
 * top of the page.
 *
 * Everything here is counted from data the page already has: the picks are in
 * the main bundle, and the page loads every season's matchups anyway for its
 * own tables (`useAllSeasons`). So the counts are exact rather than read off
 * the precomputed file, which keeps only the top 25 of 536 drafted players and
 * would leave everyone else with no rail at all.
 *
 * The three destinations are all pages the player page does not otherwise
 * reach: the draft board he last went in, the game he had his best week in, and
 * the most-capped list of the manager who played him most.
 */
import { hasIncompleteBench } from "@/domain/dataQuality";
import type { RailItem, RailSection } from "./rail";
import { clean, compactSections, points } from "./rail";

export interface RailPick {
  year: number;
  round: number;
  ownerId: string;
  managerName: string;
}

export interface RailBestWeek {
  year: number;
  week: number;
  matchupId: number;
  points: number;
  teamName: string;
  wasStarted: boolean;
}

export interface RailOwner {
  ownerId: string;
  teamName: string;
  starts: number;
}

export interface PlayerRailInput {
  /** Every pick of this player, any order. */
  picks: RailPick[];
  /** His best single week, or null when he has never scored. */
  bestWeek: RailBestWeek | null;
  /** One row per manager who has rostered him. */
  owners: RailOwner[];
  /** Internal manager id for a Sleeper owner id, or null when unknown. */
  managerIdOf: (ownerId: string) => string | null;
  /**
   * Whether that year/week/id is really a two-sided game. A playoff team-week
   * with no opponent carries no matchup id, and a link to one is a dead end.
   */
  isRealPairing: (year: number, week: number, matchupId: number) => boolean;
}

/**
 * "Drafted 7 times by 4 managers, 2014–2025", pointing at the draft board he
 * last went in.
 *
 * The count is the count. A player taken once says once and names the manager,
 * because "drafted by several" to cover a single pick is the sort of padding
 * that makes a whole rail untrustworthy.
 */
export const draftItem = (picks: RailPick[]): RailItem | null => {
  if (!picks.length) return null;

  const years = picks.map((pick) => pick.year);
  const latestYear = Math.max(...years);
  const earliestYear = Math.min(...years);
  const latest = picks.find((pick) => pick.year === latestYear)!;
  const managers = new Set(picks.map((pick) => pick.ownerId)).size;

  const detail =
    picks.length === 1
      ? `Drafted once — ${latest.managerName}, round ${latest.round} of ${latest.year}`
      : `Drafted ${picks.length} times by ${managers} ` +
        `${managers === 1 ? "manager" : "managers"}` +
        (earliestYear === latestYear ? "" : `, ${earliestYear}–${latestYear}`);

  return {
    id: "draft",
    to: `/seasons/${latestYear}/draft`,
    label: `The ${latestYear} draft board`,
    detail,
  };
};

/**
 * His best week, pointing at the game it happened in.
 *
 * 2019's bench scores are incomplete, so a best week from that season spent
 * on the bench is marked rather than dropped — a caveat, not a reason to hide
 * the biggest week a player ever had. A started week is not marked: 2019's
 * starters and their scores are right.
 */
export const bestWeekItem = (input: PlayerRailInput): RailItem | null => {
  const best = input.bestWeek;
  if (!best || best.points <= 0) return null;
  if (!Number.isFinite(best.matchupId)) return null;
  if (!input.isRealPairing(best.year, best.week, best.matchupId)) return null;

  return {
    id: "best-week",
    to: `/seasons/${best.year}/matchups/${best.week}/${best.matchupId}`,
    label: `The week he scored ${points(best.points)}`,
    detail:
      `${clean(best.teamName)}, ${best.year} Week ${best.week}` +
      (best.wasStarted ? "" : " — and it was on the bench"),
    approximate: hasIncompleteBench(best.year) && !best.wasStarted,
  };
};

/**
 * The manager who started him most, pointing at who else that manager starts.
 *
 * The label deliberately does not promise this player is on the page it opens:
 * the Most Capped list is that manager's top twelve, and a player with fifteen
 * starts for someone whose twelfth-most-capped has nineteen is genuinely not
 * there. "Who else X keeps starting" is an invitation and is true either way;
 * "X's most-capped players" reads as a promise the page sometimes breaks.
 *
 * Only built when one manager is strictly ahead. A three-way tie on four starts
 * is not "more than anyone", and there is no honest way to write it in one
 * line, so the item is dropped.
 */
export const topOwnerItem = (input: PlayerRailInput): RailItem | null => {
  const started = input.owners.filter((owner) => owner.starts > 0);
  if (!started.length) return null;

  const most = started.reduce((best, owner) =>
    owner.starts > best.starts ? owner : best
  );
  const tied = started.filter((owner) => owner.starts === most.starts).length;
  if (tied > 1) return null;

  const managerId = input.managerIdOf(most.ownerId);
  if (!managerId) return null;

  return {
    id: "top-owner",
    to: `/managers/${managerId}/players/capped`,
    label: `Who else ${clean(most.teamName)} keeps starting`,
    detail:
      started.length === 1
        ? `The only manager who ever started him — ${most.starts} ` +
          `${most.starts === 1 ? "time" : "times"}`
        : `Started him ${most.starts} times, more than anyone`,
  };
};

/** One section. Renders nothing when the player has no history to point at. */
export const buildPlayerRail = (input: PlayerRailInput): RailSection[] => {
  const items = [
    draftItem(input.picks),
    bestWeekItem(input),
    topOwnerItem(input),
  ].filter((item): item is RailItem => item !== null);

  return compactSections([{ items }]);
};
