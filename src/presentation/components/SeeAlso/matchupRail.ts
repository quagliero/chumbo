/**
 * The matchup page's rail (E2).
 *
 * Someone arrives at one game from a link in the group chat. The rail is how
 * they leave having found three more things: the whole series between these
 * two, the other game they played each other this season, the five other games
 * that week, and where each of them ended up that year.
 *
 * ## What it is allowed to know
 *
 * The page holds ONE season's matchups (A2a) plus the eager rosters, brackets
 * and league settings. Everything below is built from exactly that, so the rail
 * costs no fetch at all — with one exception, the all-time series count, which
 * comes from the precomputed `rivalry-intensity` row in `all-time.json`. That
 * file is 19 kB, the page already fetches it for E7's notes, and the count is a
 * build-time fact rather than something this page could work out.
 *
 * The alternative — calling `getAllTimeH2HRecord` here — would need every
 * season's matchups, ~305 kB gzipped, for one sentence. See the note on
 * `rivalryItem` for what that means for the pairings the precomputed row does
 * not cover.
 */
import type { ExtendedMatchup } from "@/types/matchup";
import type { StatEntry } from "@/utils/stats/types";
import { ordinal } from "@/utils/narrative/phrases";
import {
  clean,
  compactSections,
  points,
  type RailItem,
  type RailSection,
} from "./rail";

export interface RailTeam {
  rosterId: number;
  /** Internal manager id (`thd`), or null for a roster with no manager entry. */
  managerId: string | null;
  /** What to call them — the team name the page is already showing. */
  name: string;
  /** Where they finished that season, or null while it is undecided. */
  finish: number | null;
}

export interface MatchupRailInput {
  year: number;
  week: number;
  matchupId: number;
  teams: [RailTeam, RailTeam];
  /** This season's matchups, exactly as the page already holds them. */
  matchups: Record<string, ExtendedMatchup[]>;
  /** Roster id to display name. */
  nameOf: (rosterId: number) => string;
  /** Whether a week has actually been played. Unplayed weeks are not games. */
  isPlayed: (week: number) => boolean;
  /** How many teams the league had that season, for "3rd of 12". */
  teamCount: number;
  /**
   * The `rivalry-intensity` row for this pairing, when `all-time.json` has one.
   * Its `detail` is already a sentence ("24 meetings since 2012, thd leads
   * 16–8") and is used verbatim — parsing a number back out of it would be a
   * second place for the count to be wrong.
   */
  rivalry?: StatEntry | null;
}

export interface Pairing {
  matchupId: number;
  /** The higher score first, so the label reads as a result. */
  winner: ExtendedMatchup;
  loser: ExtendedMatchup;
}

/**
 * The real two-sided games in one week.
 *
 * Two things make a team-week not a game: an eliminated team in a playoff week
 * has no `matchup_id` at all, and a bracket week can leave a lone side. Both
 * would otherwise become a link to "Invalid matchup data".
 */
export const pairingsInWeek = (
  weekMatchups: ExtendedMatchup[] | undefined
): Pairing[] => {
  if (!weekMatchups?.length) return [];

  const byId = new Map<number, ExtendedMatchup[]>();
  for (const side of weekMatchups) {
    // `matchup_id` is typed as a number but is null in the data for a team with
    // no opponent left.
    if (!Number.isFinite(side.matchup_id)) continue;
    const bucket = byId.get(side.matchup_id);
    if (bucket) bucket.push(side);
    else byId.set(side.matchup_id, [side]);
  }

  return [...byId.entries()]
    .filter(([, sides]) => sides.length === 2)
    .map(([matchupId, sides]) => {
      const [a, b] = sides;
      const winnerFirst = a.points >= b.points ? [a, b] : [b, a];
      return { matchupId, winner: winnerFirst[0], loser: winnerFirst[1] };
    })
    .sort((x, y) => x.matchupId - y.matchupId);
};

const matchupHref = (year: number, week: number, matchupId: number): string =>
  `/seasons/${year}/matchups/${week}/${matchupId}`;

/** "sol 118.4 – 96.2 jay". A tie reads the same either way round. */
const scoreline = (pairing: Pairing, nameOf: (rosterId: number) => string): string =>
  `${clean(nameOf(pairing.winner.roster_id))} ${points(pairing.winner.points)} – ` +
  `${points(pairing.loser.points)} ${clean(nameOf(pairing.loser.roster_id))}`;

/**
 * The whole series between these two.
 *
 * With the precomputed row this is E2's headline item — "24 meetings since
 * 2012, thd leads 16–8". Without it the item is still built, because a link
 * from a game to the pairing's full history is the single most useful thing on
 * the rail and the H2H page computes the record itself once you are there. What
 * it will NOT do is guess at a count: `rivalry-intensity` only covers pairings
 * with twelve or more meetings, and the rest get the link with no number
 * attached rather than a number that might be wrong.
 *
 * The qualifier matters and is not decoration. `rivalry-intensity` counts EVERY
 * meeting, playoffs included; the H2H page this links to counts the regular
 * season only. So hadkiss and ant are "19 meetings, hadkiss leads 12–7" here
 * and "11-7 over 18" one click later, and without saying which is which the
 * rail reads as a lie about the page it points at.
 */
export const rivalryItem = (
  teams: [RailTeam, RailTeam],
  rivalry?: StatEntry | null
): RailItem | null => {
  const [a, b] = teams;
  if (!a.managerId || !b.managerId || a.managerId === b.managerId) return null;

  return {
    id: "h2h",
    to: `/h2h/${a.managerId}/${b.managerId}`,
    label: `Head to head: ${clean(a.name)} vs ${clean(b.name)}`,
    detail: rivalry?.detail
      ? `${rivalry.detail} — playoffs included`
      : "Every meeting, season by season",
  };
};

/**
 * The `rivalry-intensity` row for a pairing, or undefined.
 *
 * The stat keys each pairing as `${a} vs ${b}` with the ids in lexicographic
 * order and one row per unordered pairing, so the lookup has to sort too — done
 * here rather than at the call site so there is one place for it to be wrong.
 */
export const findRivalry = (
  entries: StatEntry[] | undefined,
  managerA: string | null,
  managerB: string | null
): StatEntry | undefined => {
  if (!entries?.length || !managerA || !managerB) return undefined;
  const [a, b] = managerA < managerB ? [managerA, managerB] : [managerB, managerA];
  const key = `${a} vs ${b}`;
  return entries.find((entry) => entry.subject === key);
};

/**
 * Their other meetings this same season.
 *
 * A twelve-team league on a fourteen-week schedule plays some pairings twice,
 * and the rematch is the most interesting single link on the page: same two
 * teams, different result, six weeks apart.
 */
export const rematchItems = (input: MatchupRailInput): RailItem[] => {
  const [a, b] = input.teams;
  const items: RailItem[] = [];

  for (const [weekKey, weekMatchups] of Object.entries(input.matchups)) {
    const week = Number(weekKey);
    if (week === input.week || !Number.isFinite(week)) continue;
    if (!input.isPlayed(week)) continue;

    for (const pairing of pairingsInWeek(weekMatchups)) {
      const rosterIds = [pairing.winner.roster_id, pairing.loser.roster_id];
      if (!rosterIds.includes(a.rosterId) || !rosterIds.includes(b.rosterId)) {
        continue;
      }
      items.push({
        id: `rematch-${week}`,
        to: matchupHref(input.year, week, pairing.matchupId),
        label:
          week > input.week
            ? `They met again in Week ${week}`
            : `They also met in Week ${week}`,
        detail: scoreline(pairing, input.nameOf),
      });
    }
  }

  return items.sort((x, y) => x.id.localeCompare(y.id));
};

/**
 * Where each of them ended up that year.
 *
 * `/managers/:id/seasons` rather than the manager's front page: the question a
 * game raises about a manager is how that season went, and that is the tab that
 * answers it. The finish is only claimed once the season has one — mid-season
 * the item is the link alone.
 *
 * "After the playoffs" is load-bearing, for the same reason as the rivalry
 * qualifier. This is the bracket-decided finish (`finalStandings`), and the
 * Seasons tab it links to shows the regular-season standing, so 2018 reads 9th
 * here and #7 there. Both are true of different questions; saying which one
 * this is costs three words.
 */
export const managerSeasonItems = (input: MatchupRailInput): RailItem[] =>
  input.teams
    .filter((team): team is RailTeam & { managerId: string } =>
      Boolean(team.managerId)
    )
    .map((team) => ({
      id: `season-${team.managerId}`,
      to: `/managers/${team.managerId}/seasons`,
      label: `${clean(team.name)}, season by season`,
      detail:
        team.finish === null
          ? undefined
          : `Finished ${ordinal(team.finish)} of ${input.teamCount} in ` +
            `${input.year} — after the playoffs`,
    }));

/** The other games played that week, newest-first by matchup id. */
export const otherGamesItems = (input: MatchupRailInput): RailItem[] => {
  const weekMatchups = input.matchups[String(input.week)];
  const items = pairingsInWeek(weekMatchups)
    .filter((pairing) => pairing.matchupId !== input.matchupId)
    // A 0–0 pairing is a fixture, not a game. Only reachable in a live week.
    .filter((pairing) => pairing.winner.points + pairing.loser.points > 0)
    .map((pairing) => ({
      id: `game-${pairing.matchupId}`,
      to: matchupHref(input.year, input.week, pairing.matchupId),
      label: scoreline(pairing, input.nameOf),
    }));

  if (!items.length) return [];

  // The week's own page, so the rail is a way back out as well as sideways.
  return [
    ...items,
    {
      id: "week",
      to: `/seasons/${input.year}/matchups?week=${input.week}`,
      label: `All of Week ${input.week}, ${input.year}`,
    },
  ];
};

/**
 * The rail, in two sections: where this pairing goes, then the rest of the
 * week. Empty sections are dropped, and an empty rail renders nothing.
 */
export const buildMatchupRail = (input: MatchupRailInput): RailSection[] => {
  const rivalry = rivalryItem(input.teams, input.rivalry);

  return compactSections([
    {
      items: [
        ...(rivalry ? [rivalry] : []),
        ...rematchItems(input),
        ...managerSeasonItems(input),
      ],
    },
    {
      heading: `Elsewhere in Week ${input.week}`,
      items: otherGamesItems(input),
    },
  ]);
};
