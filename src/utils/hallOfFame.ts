import { managers, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { getFinalStandings } from "@/utils/finalStandings";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import type { PrecomputedStats } from "@/utils/stats/precomputed";
import {
  getScumboCrown,
  getScumboHolders,
  getSeasonCrowns,
  getTripleCrown,
} from "@/utils/crowns";
import { getSeasonBreakdown } from "@/utils/seasonBreakdown";
import type { StatEntry } from "@/utils/stats/types";

/**
 * Who goes in the Hall of Fame's manager wing, and who goes in the Ring of
 * Shame (F4c, F4d).
 *
 * Everything here is DERIVED. Nothing in this file is a hand-typed claim about
 * a league member, because a joke resting on a wrong number is worse than no
 * joke. Two sources, both already tested elsewhere:
 *
 *   `getFinalStandings(year)`  the true finishing order out of the playoff
 *                              brackets — champion is position 1, not "best
 *                              regular-season record".
 *   `public/data/all-time.json` the build-time answers from the stat registry
 *                              (A4). The registry's own tests assert the file
 *                              is not stale; this file only picks rows out of
 *                              it and never recomputes them differently.
 *
 * The only judgement calls are the two constants below and the choice of which
 * eight records the Ring shames. Both are commented where they are made and
 * both are surfaced in the UI, so an entry explains itself.
 */

/**
 * Career-rate records (efficiency, points per waiver pickup) are only ranked
 * among managers with at least this many completed seasons.
 *
 * Three men played exactly one season — jimmie and karsten in 2012, phil in
 * 2016 — and a fourteen-game career is not a career. Without a floor, a single
 * unlucky autumn could hold a "worst in league history" title forever.
 *
 * It happens not to change any current answer (brock is bottom on efficiency
 * with seven seasons; sol is bottom on waiver return with twelve). It is here
 * so that it cannot change one later without anybody noticing.
 */
export const MIN_SEASONS_FOR_CAREER_RECORD = 5;

/** A season a manager played, and where they actually finished it. */
export interface SeasonFinish {
  year: number;
  /** 1 = champion. */
  position: number;
  /** How many teams were in the league that year — 10 before 2014, 12 since. */
  teams: number;
}

export interface ManagerHonours {
  managerId: string;
  name: string;
  teamName: string;
  finishes: SeasonFinish[];
  /** Years won, ascending. */
  titles: number[];
  /** Years finished second, ascending. */
  runnerUps: number[];
  /**
   * Years they took the Scumbo, ascending.
   *
   * The Scumbo is the worst BREAKDOWN — the all-play record — not last place
   * in the standings. The two disagree in five of the fourteen completed
   * seasons, and having both on the site would put a "wooden spoon" on one
   * manager's card while the Ring of Shame awarded that year's Scumbo to
   * somebody else.
   */
  spoons: number[];
  /** Best finish ever, or `null` for a manager with no completed season. */
  bestFinish: number | null;
}

/**
 * Seasons whose result is final.
 *
 * A season is complete when its final has a winner (brackets alone are not
 * enough: they arrive when the playoffs start). Detected rather than hardcoded, so the
 * in-progress season drops out on its own: on 2026's data today every roster
 * is 0-0, and reading a champion or a wooden spoon off that would be an
 * invented fact rather than a late one.
 */
export const completedSeasons = (): number[] =>
  YEAR_NUMBERS.filter((year) => isSeasonSettled(seasons[year]));

/**
 * Every manager's finishing record across the completed seasons.
 *
 * Returned sorted: most titles first, then most runner-up finishes, then most
 * seasons played, then alphabetically — so the order is total and stable
 * rather than dependent on `managers.json`'s order.
 */
export const getManagerHonours = (): ManagerHonours[] => {
  const byManager = new Map<string, ManagerHonours>();

  const blank = (managerId: string): ManagerHonours => {
    const manager = managers.find((m) => m.id === managerId);
    return {
      managerId,
      name: manager?.name ?? managerId,
      teamName: manager?.teamName ?? managerId,
      finishes: [],
      titles: [],
      runnerUps: [],
      spoons: [],
      bestFinish: null,
    };
  };

  for (const year of completedSeasons()) {
    const season = seasons[year];
    if (!season?.rosters?.length) continue;

    const ownerByRoster = new Map(
      season.rosters.map((roster) => [roster.roster_id, roster.owner_id])
    );
    const standings = getFinalStandings(year);
    const teams = standings.length;

    for (const standing of standings) {
      const ownerId = ownerByRoster.get(standing.rosterId);
      const managerId = ownerId
        ? getManagerIdBySleeperOwnerId(ownerId)
        : undefined;
      // A roster nobody in managers.json claims. Better to drop it than to
      // credit a title to the wrong person.
      if (!managerId) continue;

      let honours = byManager.get(managerId);
      if (!honours) byManager.set(managerId, (honours = blank(managerId)));

      honours.finishes.push({ year, position: standing.position, teams });
      if (standing.position === 1) honours.titles.push(year);
      if (standing.position === 2) honours.runnerUps.push(year);
      // Last place is recorded through `finishes`; the Scumbo is awarded
      // separately below, off the breakdown.
      honours.bestFinish =
        honours.bestFinish === null
          ? standing.position
          : Math.min(honours.bestFinish, standing.position);
    }

    for (const crown of getScumboHolders(year)) {
      if (crown.provisional) continue;
      byManager.get(crown.managerId)?.spoons.push(year);
    }
  }

  return [...byManager.values()].sort(
    (a, b) =>
      b.titles.length - a.titles.length ||
      b.runnerUps.length - a.runnerUps.length ||
      b.finishes.length - a.finishes.length ||
      a.managerId.localeCompare(b.managerId)
  );
};

/* ------------------------------------------------------------------ *
 * The manager wing
 * ------------------------------------------------------------------ */

export interface WingEntry extends ManagerHonours {
  /** e.g. "The Cat Burglar", from the `manager-archetypes` stat. */
  archetype?: string;
  /** The rest of that stat's sentence — the measurement behind the label. */
  archetypeReason?: string;
  /**
   * Seasons where they took most wins, most points AND the title.
   *
   * The league's Triple Crown, and the rarest thing on this page: two of them
   * in fifteen seasons. Topping the table and the scoring charts still leaves
   * you one playoff upset from missing it, which is exactly why it counts.
   */
  tripleCrowns: number[];
}

/**
 * Split "The Cat Burglar — 25 wins by under five points, most in the league"
 * into its label and its evidence. The em-dash form is what
 * `manager-archetypes` emits for all fourteen of its entries; a row that ever
 * stops matching falls back to showing the whole sentence, which is still true.
 */
const splitArchetype = (
  detail: string | undefined
): { archetype?: string; archetypeReason?: string } => {
  if (!detail) return {};
  const at = detail.indexOf(" — ");
  if (at === -1) return { archetypeReason: detail };
  return {
    archetype: detail.slice(0, at),
    archetypeReason: detail.slice(at + 3),
  };
};

/**
 * The manager wing: **every manager who has won a Chumbo championship.**
 *
 * The bar is a title and only a title. It is the one honour this league
 * actually contests, it comes straight off the playoff bracket, and it needs
 * no committee — which is the point, because a hand-picked wing would be an
 * opinion dressed as a record. Ten of the seventeen managers clear it.
 *
 * Ordered by titles, then runner-up finishes, then seasons served.
 */
export const getManagersWing = (stats: PrecomputedStats): WingEntry[] => {
  const archetypes = new Map(
    (stats.stats.find((stat) => stat.id === "manager-archetypes")?.entries ?? [])
      .map((entry) => [entry.subject, entry.detail] as const)
  );

  const tripleCrowns = new Map<string, number[]>();
  for (const year of completedSeasons()) {
    const crown = getTripleCrown(year);
    if (!crown) continue;
    const years = tripleCrowns.get(crown.managerId) ?? [];
    years.push(year);
    tripleCrowns.set(crown.managerId, years);
  }

  return getManagerHonours()
    .filter((honours) => honours.titles.length > 0)
    .map((honours) => ({
      ...honours,
      ...splitArchetype(archetypes.get(honours.managerId)),
      tripleCrowns: tripleCrowns.get(honours.managerId) ?? [],
    }));
};

/* ------------------------------------------------------------------ *
 * The Ring of Shame
 * ------------------------------------------------------------------ */

export interface ShameEntry {
  id: string;
  /** The joke. */
  title: string;
  /** The criterion, stated plainly enough that a reader can check it. */
  basis: string;
  managerId: string;
  /** Display name and team, resolved from managers.json. */
  name: string;
  teamName: string;
  /** The number, formatted with its unit. Always rendered. */
  value: string;
  /** The context that makes it a story, straight from the source. */
  detail: string;
  /** Where to go and look at it, when the source knows. */
  href?: string;
  /** Seasons the underlying stat cannot see at all. */
  excluded: number[];
  /** True when this number rests on 2019's incomplete bench scores. */
  approximate?: boolean;
}

const oneDecimal = (value: number): string => value.toFixed(1);

/** Join years the way a sentence would: "2014, 2016 and 2017". */
export const listYears = (years: number[]): string => {
  if (years.length === 0) return "";
  if (years.length === 1) return String(years[0]);
  return `${years.slice(0, -1).join(", ")} and ${years[years.length - 1]}`;
};

/**
 * Pick one row out of a precomputed stat.
 *
 * `direction` on the stat says which end is the notable one, so "the worst"
 * is not always the last row — `worst-draft-picks` is already sorted worst
 * first. `end` says which end of the stat's own ranking we want.
 */
const pick = (
  stats: PrecomputedStats,
  statId: string,
  end: "top" | "bottom",
  eligible?: (entry: StatEntry) => boolean
): { entry: StatEntry; excluded: number[] } | null => {
  const stat = stats.stats.find((s) => s.id === statId);
  if (!stat) return null;

  const rows = eligible ? stat.entries.filter(eligible) : stat.entries;
  if (rows.length === 0) return null;

  // The file stores only the top `limit` rows of each stat, so "bottom" is only
  // meaningful where the whole ranking fits. Every stat this file reads from
  // the bottom is a per-manager one with at most 17 rows; guard anyway, because
  // a silently truncated "worst in league history" would be a lie.
  if (end === "bottom" && stat.total > stat.entries.length) return null;

  const entry = end === "top" ? rows[0] : rows[rows.length - 1];
  return { entry, excluded: stat.excluded };
};

/**
 * The Ring of Shame.
 *
 * Eight records, each the genuine holder of the thing described. Two rules,
 * both deliberate:
 *
 *   1. The Ring ranks RECORDS, not people. A manager who holds two of them
 *      appears twice. Spreading the entries around to be kind would mean
 *      labelling somebody "the worst" who is not.
 *   2. Every entry carries its number and its criterion into the UI. The joke
 *      is in the heading; the evidence is underneath it.
 *
 * Seven of the eight come straight off a precomputed stat and change when the
 * data does. The two spoon entries come off the brackets. Any entry whose
 * source is missing is dropped rather than faked, so the Ring can come back
 * shorter but never wrong.
 */
export const getRingOfShame = (stats: PrecomputedStats): ShameEntry[] => {
  const entries: ShameEntry[] = [];
  const honours = getManagerHonours();
  const completed = completedSeasons();

  /* 1. Most full Scumbos.
   *
   *    The Scumbo is the league's wooden spoon, and it is NOT last place: it
   *    goes to the worst BREAKDOWN — the all-play record, how you did against
   *    the whole league every week rather than against the one opponent the
   *    schedule handed you. The two disagree in five of the fourteen completed
   *    seasons, so this used to name the wrong people.
   *
   *    It also has three levels, and the full set is the one worth a trophy:
   *    worst all-play, fewest wins, fewest points. */
  const scumboYears = new Map<string, number[]>();
  const scumboLegYears = new Map<string, number[]>();
  for (const year of completed) {
    for (const crown of getScumboCrown(year)) {
      const years = scumboYears.get(crown.managerId) ?? [];
      years.push(year);
      scumboYears.set(crown.managerId, years);
    }
    for (const crown of getSeasonCrowns(year)) {
      if (crown.scumboLegs === 0 || crown.provisional) continue;
      const years = scumboLegYears.get(crown.managerId) ?? [];
      years.push(year);
      scumboLegYears.set(crown.managerId, years);
    }
  }

  const mostScumbos = [...scumboYears.entries()].sort(
    (a, b) => b[1].length - a[1].length || (b[1][b[1].length - 1] ?? 0) - (a[1][a[1].length - 1] ?? 0)
  )[0];
  if (mostScumbos) {
    const [managerId, years] = mostScumbos;
    const honour = honours.find((h) => h.managerId === managerId);
    entries.push({
      id: "most-scumbos",
      title: "The Scumbo Cabinet",
      basis:
        "Most full Scumbos — worst all-play record, fewest wins and fewest " +
        "points, all three in the same season.",
      managerId,
      name: honour?.name ?? managerId,
      teamName: honour?.teamName ?? "",
      value: `${years.length} full Scumbo${years.length === 1 ? "" : "s"}`,
      detail: `The complete set in ${listYears(years)}${
        honour && honour.titles.length === 0
          ? ` — and ${honour.finishes.length} seasons without a title to set against them`
          : ""
      }.`,
      href: `/managers/${managerId}`,
      excluded: [],
    });
  }

  /* 2. The reigning Scumbo — worst breakdown of the most recently completed
   *    season. The one entry a champion can walk into. */
  const latest = completed[completed.length - 1];
  const reigningHolders = getScumboHolders(latest).filter((c) => !c.provisional);
  const reigning = reigningHolders[0];
  if (reigning) {
    const honour = honours.find((h) => h.managerId === reigning.managerId);
    const record = getSeasonBreakdown(latest).find(
      (b) => b.rosterId === reigning.rosterId
    );
    const legs = [
      reigning.worstAllPlay && "worst all-play",
      reigning.fewestWins && "fewest wins",
      reigning.fewestPoints && "fewest points",
    ].filter(Boolean) as string[];
    entries.push({
      id: "reigning-scumbo",
      title: `Holder of the ${latest} Scumbo`,
      basis: `Worst breakdown — all-play record — in ${latest}, the most recently completed season.`,
      managerId: reigning.managerId,
      name: honour?.name ?? reigning.managerId,
      teamName: honour?.teamName ?? "",
      value: record
        ? `${record.wins}-${record.losses} all-play (${(record.winPercentage * 100).toFixed(1)}%)`
        : "worst breakdown",
      detail:
        (reigning.scumboLegs === 3
          ? "The full Scumbo: "
          : `${legs.length} of the three: `) +
        legs.join(", ") +
        (honour && honour.titles.length > 0
          ? `. A ${honour.titles.length}-time champion (${listYears(
              honour.titles
            )}), which makes it worse rather than better.`
          : "."),
      href: `/managers/${reigning.managerId}`,
      excluded: [],
    });
  }

  /* 3-8. Straight off the stat registry. */
  const fromStat = ({
    id,
    statId,
    end,
    title,
    basis,
    unit,
    eligible,
  }: {
    id: string;
    statId: string;
    end: "top" | "bottom";
    title: string;
    basis: string;
    unit: (value: number) => string;
    eligible?: (entry: StatEntry) => boolean;
  }) => {
    const picked = pick(stats, statId, end, eligible);
    if (!picked) return;
    // A manager id is required: the entry links to a person, and a row whose
    // subject is a player name ("Le'Veon Bell") is about the manager named in
    // its detail, not about a manager we can resolve. Those stats are chosen so
    // that `subject` IS the manager; anything else is dropped rather than
    // guessed at by parsing the sentence.
    const manager = managers.find((m) => m.id === picked.entry.subject);
    if (!manager) return;

    entries.push({
      id,
      title,
      basis,
      managerId: manager.id,
      name: manager.name,
      teamName: manager.teamName,
      value: unit(picked.entry.value),
      detail: picked.entry.detail ?? "",
      href: picked.entry.href,
      excluded: picked.excluded,
      approximate: picked.entry.approximate,
    });
  };

  const longServing = new Set(
    honours
      .filter((h) => h.finishes.length >= MIN_SEASONS_FOR_CAREER_RECORD)
      .map((h) => h.managerId)
  );
  const isLongServing = (entry: StatEntry) => longServing.has(entry.subject);

  fromStat({
    id: "bench-points",
    statId: "bench-points",
    end: "top",
    title: "The Bench Warmer",
    basis: "Most points left sitting on the bench across a whole career.",
    unit: (value) => `${oneDecimal(value)} points benched`,
  });

  fromStat({
    id: "manager-efficiency",
    statId: "manager-efficiency",
    end: "bottom",
    title: "How Hard Can Picking Nine Names Be",
    basis: `Lowest share of the best possible score actually started, among managers with at least ${MIN_SEASONS_FOR_CAREER_RECORD} completed seasons.`,
    unit: (value) => `${oneDecimal(value)}% efficient`,
    eligible: isLongServing,
  });

  fromStat({
    id: "worst-start-sit",
    statId: "worst-start-sit",
    end: "top",
    title: "The Single Worst Decision Ever Made",
    basis:
      "The biggest gap between a player left on the bench and the starter he could have replaced.",
    unit: (value) => `${oneDecimal(value)} points thrown away`,
  });

  fromStat({
    id: "longest-loss-streak",
    statId: "longest-loss-streak",
    end: "top",
    title: "The Long Dark Autumn",
    basis:
      "The longest run of consecutive losses anyone has endured, counted through the playoffs and into the next season.",
    unit: (value) => `${value} straight defeats`,
  });

  fromStat({
    id: "waiver-hit-rate",
    statId: "waiver-hit-rate",
    end: "bottom",
    title: "Refresh, Claim, Repeat",
    basis: `Fewest points started per waiver pickup, among managers with at least ${MIN_SEASONS_FOR_CAREER_RECORD} completed seasons.`,
    unit: (value) => `${value.toFixed(2)} points per pickup`,
    eligible: isLongServing,
  });

  fromStat({
    id: "roster-churn",
    statId: "roster-churn",
    end: "top",
    title: "Busiest Man in Fantasy Football",
    basis:
      "Most completed moves by one manager in one season — every add, every drop, every trade.",
    unit: (value) => `${value} moves in one season`,
  });

  return entries;
};
