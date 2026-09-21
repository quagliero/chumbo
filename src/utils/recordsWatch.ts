/**
 * The records watch (J3): what could still happen this season.
 *
 * Every other stat on the site is about what HAS happened. This one is about
 * a season in progress — who is on pace for a record, whose run is nearly the
 * longest ever, who is a couple of wins from a round number — which makes it
 * the one place the site is tempted to overclaim. So three rules, and the
 * thresholds below exist to enforce them:
 *
 *   1. **A pace is arithmetic, not a prediction.** It is this season's points
 *      per game over the games that are left, and the sentence always says how
 *      many games it is from and how many remain. Nothing is smoothed,
 *      weighted or regressed, because a reader can check straight-line
 *      division and cannot check a model.
 *   2. **Not until there is a season to divide.** Four games. A pace from two
 *      is a coin toss printed as a forecast.
 *   3. **Only what is nearly in reach.** A record within 3% of the pace, a run
 *      within two of the longest ever, a milestone reachable in the games that
 *      are actually left. Everything else is a table, and the site has tables.
 *
 * Pure — no data loading, no registry, no dictionary — so the same function
 * answers for a live season and for a test's truncated one, and so the stat
 * that publishes it (`stats/watchStat.ts`) is the only thing that has to know
 * where the numbers come from.
 */

export type WatchKind = "season-points" | "streak" | "milestone";

export interface WatchItem {
  kind: WatchKind;
  /** Whose watch it is. The rail prints the name, so `text` does not. */
  managerId: string;
  /**
   * The sentence WITHOUT its subject — "is two wins from 100 regular-season
   * wins". The rail prints the name and this after it, so the two read as one
   * sentence; a `text` that began with the name would be printed twice or
   * would have to be taken apart again.
   */
  text: string;
  /** The list it is measured against, for the reader who wants the context. */
  href: string;
  /**
   * How close it is, 0 to 1, where 1 is "already done". Ranks the rail: a
   * record about to fall belongs above a milestone three weeks away.
   */
  urgency: number;
}

export interface WatchTeam {
  managerId: string;
  /** Regular-season games played so far. */
  played: number;
  /** Regular-season points so far. */
  points: number;
}

export interface WatchRecord {
  value: number;
  managerId: string;
  year: number;
  /** How many games that season was, which is not always this season's. */
  games: number;
}

export interface WatchCareer {
  managerId: string;
  /** Regular-season wins and points, the basis K1's previews use. */
  wins: number;
  points: number;
  /** Their points per regular-season game, for "about two weeks away". */
  perGame: number;
}

export interface WatchStreaks {
  current: Map<string, { kind: "win" | "loss"; count: number }>;
  longest: {
    win: { count: number; managerId: string };
    loss: { count: number; managerId: string };
  };
}

export interface WatchInput {
  /** The regular season's length this year, in games. */
  games: number;
  teams: readonly WatchTeam[];
  seasonRecord?: WatchRecord;
  careers: readonly WatchCareer[];
  streaks: WatchStreaks;
  /** A manager id to the name a sentence should use. */
  nameOf: (managerId: string) => string;
}

/** Four games before a pace is worth printing. */
export const MIN_PACE_GAMES = 4;
/** A pace inside 3% of the record is a watch; further off is a table. */
const PACE_WITHIN = 0.97;
/** A run this close to the longest ever is worth saying. */
const STREAK_WITHIN = 2;
/** ...but three is the shortest run anyone would call a streak. */
const MIN_STREAK = 3;
/** Career milestones: every 25th win and every 5,000th point (as K1). */
export const WIN_MILESTONE = 25;
export const POINTS_MILESTONE = 5000;
/** How near a milestone has to be: four wins, or three weeks of points. */
const WINS_IN_REACH = 4;
const POINTS_IN_REACH_WEEKS = 3;

export const nextWinMilestone = (wins: number): number =>
  Math.floor(wins / WIN_MILESTONE + 1) * WIN_MILESTONE;

export const nextPointsMilestone = (points: number): number =>
  Math.floor(points / POINTS_MILESTONE + 1) * POINTS_MILESTONE;

const round1 = (value: number) => Math.round(value * 10) / 10;

const points = (value: number) =>
  round1(value).toLocaleString("en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const whole = (value: number) => Math.round(value).toLocaleString("en-GB");

/**
 * A record, to the hundredth, exactly as `/records` prints it.
 *
 * The pace beside it is rounded to a tenth on purpose — it is a projection,
 * and a projection to the hundredth is false precision. The record is not a
 * projection, and the reader can click through to the list, so it is quoted
 * to the digit that list shows.
 */
const exact = (value: number) => {
  const [units, fraction] = value.toFixed(2).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${Number(units).toLocaleString("en-GB")}${trimmed ? `.${trimmed}` : ""}`;
};

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
];

const count = (n: number) => WORDS[n] ?? String(n);

const games = (n: number) => `${count(n)} game${n === 1 ? "" : "s"}`;

/** "(dix, 2013)", or "(dix, 2013, over thirteen games)" when that differs. */
const heldBy = (record: WatchRecord, thisYear: number, nameOf: WatchInput["nameOf"]) =>
  record.games === thisYear
    ? `${nameOf(record.managerId)}, ${record.year}`
    : `${nameOf(record.managerId)}, ${record.year}, over ${games(record.games)}`;

/* ------------------------------------------------------------ the watches */

const seasonPoints = (input: WatchInput): WatchItem[] => {
  const record = input.seasonRecord;
  if (!record) return [];

  return input.teams.flatMap((team) => {
    if (team.played < MIN_PACE_GAMES || team.played >= input.games) return [];
    const left = input.games - team.played;
    const pace = (team.points / team.played) * input.games;
    if (pace < record.value * PACE_WITHIN) return [];

    // "past the record (dix, 2013)" printed under dix's own name is a card
    // that has not noticed whose record it is.
    const mine = record.managerId === team.managerId;
    const held = mine
      ? `their own, from ${record.year}`
      : heldBy(record, input.games, input.nameOf);
    const text =
      team.points > record.value
        ? `is already past the most points ever scored in a season, with ${games(
            left
          )} to play — the record was ${exact(record.value)} (${held}).`
        : pace > record.value
          ? `is on pace for ${points(pace)} with ${games(
              left
            )} to play — past the record, ${exact(record.value)} (${held}).`
          : `is on pace for ${points(pace)} with ${games(left)} to play, just short of the record: ${exact(
              record.value
            )} (${held}).`;

    return [
      {
        kind: "season-points" as const,
        managerId: team.managerId,
        text,
        href: "/records/most-points-season",
        urgency: Math.min(1, pace / record.value),
      },
    ];
  });
};

const streaks = (input: WatchInput): WatchItem[] => {
  const items: WatchItem[] = [];
  for (const [managerId, run] of input.streaks.current) {
    if (run.count < MIN_STREAK) continue;
    const record = input.streaks.longest[run.kind];
    if (run.count < record.count - STREAK_WITHIN) continue;

    const verb = run.kind === "win" ? "has won" : "has lost";
    const runs = run.kind === "win" ? "winning run" : "losing run";
    const holder = input.nameOf(record.managerId);
    const short = record.count - run.count;
    const mine = record.managerId === managerId;

    const text =
      run.count > record.count
        ? `${verb} ${count(run.count)} straight: the longest ${runs} in Chumbo history.`
        : run.count === record.count
          ? mine
            ? `${verb} ${count(run.count)} straight — their own record ${runs}, equalled.`
            : `${verb} ${count(
                run.count
              )} straight, equalling the longest ${runs} in Chumbo history (${holder}'s ${record.count}).`
          : `${verb} ${count(run.count)} straight — ${count(
              short
            )} short of the longest ${runs} in Chumbo history (${holder}'s ${record.count}).`;

    items.push({
      kind: "streak",
      managerId,
      text,
      href: `/records/longest-${run.kind}-streak`,
      urgency: Math.min(1, run.count / record.count),
    });
  }
  return items;
};

const milestones = (input: WatchInput): WatchItem[] => {
  const items: WatchItem[] = [];
  // Only teams playing this season: a milestone nobody can reach is a fact
  // about the archive, not something to watch.
  const playing = new Map(input.teams.map((team) => [team.managerId, team]));

  for (const career of input.careers) {
    const team = playing.get(career.managerId);
    if (!team) continue;
    const left = input.games - team.played;
    if (left <= 0) continue;

    const nextWins = nextWinMilestone(career.wins);
    const winsShort = nextWins - career.wins;
    if (winsShort <= Math.min(WINS_IN_REACH, left)) {
      items.push({
        kind: "milestone",
        managerId: career.managerId,
        text: `is ${count(winsShort)} ${
          winsShort === 1 ? "win" : "wins"
        } from ${whole(nextWins)} regular-season wins.`,
        href: "/records/career-wins",
        urgency: 1 - winsShort / (WINS_IN_REACH + 1),
      });
    }

    const nextPoints = nextPointsMilestone(career.points);
    const pointsShort = nextPoints - career.points;
    const weeks = career.perGame > 0 ? pointsShort / career.perGame : Infinity;
    if (weeks <= Math.min(POINTS_IN_REACH_WEEKS, left)) {
      items.push({
        kind: "milestone",
        managerId: career.managerId,
        text: `is ${points(pointsShort)} points from ${whole(
          nextPoints
        )} in the regular season — about ${games(
          Math.max(1, Math.round(weeks))
        )} at that average.`,
        href: "/records/career-points",
        urgency: 1 - weeks / (POINTS_IN_REACH_WEEKS + 1),
      });
    }
  }
  return items;
};

/**
 * Everything worth watching, most imminent first.
 *
 * Returns nothing at all when the season has not started: a watch is about
 * what this season could still do, and in June the answer is nothing.
 */
export const buildRecordsWatch = (input: WatchInput): WatchItem[] => {
  if (!input.teams.some((team) => team.played > 0)) return [];

  return [...seasonPoints(input), ...streaks(input), ...milestones(input)].sort(
    (a, b) => b.urgency - a.urgency || a.managerId.localeCompare(b.managerId)
  );
};
